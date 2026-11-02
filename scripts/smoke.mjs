#!/usr/bin/env node
// End-to-end smoke test against a RUNNING server (npm run dev / npm start).
//   node scripts/smoke.mjs [baseUrl]      default http://localhost:3000
// It creates its own issue + incident and deletes them at the end, so seed rows are untouched.
// (Audit-log rows written along the way stay — that is the point of an audit log.)

const BASE = process.argv[2] ?? process.env.SMOKE_URL ?? "http://localhost:3000";
const PASSWORD = "Demo@1234";
let pass = 0, fail = 0;

function check(name, ok, detail = "") {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function call(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 120) }; }
  return { status: res.status, json, setCookie: res.headers.get("set-cookie") };
}

async function login(email, password = PASSWORD) {
  const r = await call("/api/auth/login", { method: "POST", body: { email, password } });
  return { ...r, cookie: r.setCookie?.split(";")[0] };
}

const created = { issue: null, incident: null };

try {
  // ---------------------------------------------------------------- auth
  const bad = await login("aarav@impactgraph.dev", "wrong-password");
  check("failed login is rejected (401)", bad.status === 401, bad.json.error);
  const unknown = await login("nobody@impactgraph.dev", "whatever");
  check("unknown email gets the SAME message", unknown.status === 401 && unknown.json.error === bad.json.error, unknown.json.error);

  let limited = null;
  for (let i = 0; i < 6; i++) limited = await login("ratelimit-test@impactgraph.dev", "nope");
  check("login rate limit: 6th failure in 15 min → 429", limited.status === 429, limited.json.error);

  const admin = await login("aarav@impactgraph.dev");
  check("admin login succeeds and sets httpOnly cookie", admin.status === 200 && /httponly/i.test(admin.setCookie ?? "") && admin.json.user?.role === "admin");
  const dev = await login("diya@impactgraph.dev");       // developer, maintains payment/billing/order services
  const dev2 = await login("sneha@impactgraph.dev");     // developer, maintains nothing
  check("developer login succeeds", dev.status === 200 && dev.json.user?.role === "developer");

  const me = await call("/api/auth/me", { cookie: admin.cookie });
  check("GET /api/auth/me returns the signed-in user", me.status === 200 && me.json.user?.email === "aarav@impactgraph.dev");

  const tmp = await login("vikram@impactgraph.dev");
  const out = await call("/api/auth/logout", { method: "POST", cookie: tmp.cookie });
  const replay = await call("/api/auth/me", { cookie: tmp.cookie });
  check("logout revokes the token: replaying the old cookie → 401", out.status === 200 && replay.status === 401, `replay ${replay.status}`);

  const anon = await call("/api/services");
  check("unauthenticated API request is rejected (401)", anon.status === 401, anon.json.error);
  const anonPage = await call("/impact");
  check("unauthenticated page request redirects to /login", [302, 307].includes(anonPage.status));

  const devs = await call("/api/developers?pageSize=100", { cookie: dev.cookie });
  check("developer list never exposes password_hash", devs.status === 200 && !JSON.stringify(devs.json).includes("password_hash") && !JSON.stringify(devs.json).includes("$2a$"));

  // ---------------------------------------------------------------- roles
  const devAudit = await call("/api/audit", { cookie: dev.cookie });
  check("developer is forbidden from the audit log (403)", devAudit.status === 403, devAudit.json.error);
  const adminAudit = await call("/api/audit", { cookie: admin.cookie });
  check("admin can read the audit log", adminAudit.status === 200 && Array.isArray(adminAudit.json.rows));
  const devDelete = await call("/api/issues/1", { method: "DELETE", cookie: dev.cookie });
  check("developer is forbidden from deleting (403)", devDelete.status === 403, devDelete.json.error);
  const devCreateSvc = await call("/api/services", { method: "POST", cookie: dev.cookie, body: { name: "x-svc", status: "active", repo_id: 1, maintainer_id: 2 } });
  check("developer cannot create services (403)", devCreateSvc.status === 403);

  // ---------------------------------------------------------------- issues
  const badIssue = await call("/api/issues", { method: "POST", cookie: dev.cookie, body: { title: "Bad", severity: "urgent", service_id: 4 } });
  check("invalid issue (enum + length) is rejected with field errors (400)", badIssue.status === 400 && badIssue.json.fields?.severity && badIssue.json.fields?.title);

  const issue = await call("/api/issues", { method: "POST", cookie: dev.cookie, body: { title: "[smoke] profile cache returns stale avatar", description: "created by scripts/smoke.mjs", severity: "medium", service_id: 4 } });
  created.issue = issue.json.id;
  check("developer creates an issue (reporter = self)", issue.status === 200 && Number.isInteger(issue.json.id), `id ${issue.json.id}`);

  const other = await call(`/api/issues/${created.issue}`, { method: "PATCH", cookie: dev2.cookie, body: { status: "in_progress" } });
  check("another developer cannot change someone else's issue (403)", other.status === 403);
  const devEdit = await call(`/api/issues/${created.issue}`, { method: "PATCH", cookie: dev.cookie, body: { severity: "critical" } });
  check("developer cannot edit fields other than status (403)", devEdit.status === 403);
  const skip = await call(`/api/issues/${created.issue}`, { method: "PATCH", cookie: dev.cookie, body: { status: "closed" } });
  check("invalid workflow jump open → closed is rejected (400)", skip.status === 400, skip.json.error);
  const step = await call(`/api/issues/${created.issue}`, { method: "PATCH", cookie: dev.cookie, body: { status: "in_progress" } });
  check("reporter moves issue open → in_progress", step.status === 200);

  // ---------------------------------------------------------------- incidents + stored procedure
  const inc = await call("/api/incidents", { method: "POST", cookie: admin.cookie, body: { title: "[smoke] charge latency spike", description: "created by scripts/smoke.mjs", severity: "high", service_id: 1 } });
  created.incident = inc.json.id;
  check("admin creates an incident", inc.status === 200 && Number.isInteger(inc.json.id), `id ${inc.json.id}`);

  const devResolveOther = await call(`/api/incidents/${created.incident}/resolve`, { method: "POST", cookie: dev2.cookie, body: { root_cause: "something", resolution: "something" } });
  check("non-maintainer developer cannot resolve (403)", devResolveOther.status === 403);
  const early = await call(`/api/incidents/${created.incident}/resolve`, { method: "POST", cookie: dev.cookie, body: { root_cause: "Pool exhausted", resolution: "Raised pool size" } });
  check("resolve from 'open' is rejected (must investigate first)", early.status === 400, early.json.error);
  const inv = await call(`/api/incidents/${created.incident}`, { method: "PATCH", cookie: dev.cookie, body: { status: "investigating" } });
  check("maintainer moves incident open → investigating", inv.status === 200);
  const viaPatch = await call(`/api/incidents/${created.incident}`, { method: "PATCH", cookie: dev.cookie, body: { status: "resolved" } });
  check("resolving through PATCH is refused (must use the procedure)", viaPatch.status === 400);
  const res = await call(`/api/incidents/${created.incident}/resolve`, { method: "POST", cookie: dev.cookie, body: { root_cause: "Connection pool exhausted", resolution: "Raised pool size, added backoff" } });
  const after = await call(`/api/incidents/${created.incident}`, { cookie: dev.cookie });
  check("incident resolved through CALL resolve_incident()", res.status === 200 && after.json.incident?.status === "resolved" && !!after.json.incident?.resolved_date);
  const again = await call(`/api/incidents/${created.incident}/resolve`, { method: "POST", cookie: admin.cookie, body: { root_cause: "x again", resolution: "y again" } });
  check("resolving twice is rejected (400)", again.status === 400, again.json.error);

  const trail = await call(`/api/audit?entity_type=incident&pageSize=50`, { cookie: admin.cookie });
  const resolvedRow = trail.json.rows?.find((r) => r.entity_id === created.incident && r.new_value?.status === "resolved");
  check("audit trigger recorded the resolve with the developer as actor (SET LOCAL)", resolvedRow?.performed_by === dev.json.user.id, `performed_by=${resolvedRow?.performed_by}`);

  // ---------------------------------------------------------------- integrity rules
  const cycle = await call("/api/dependencies", { method: "POST", cookie: admin.cookie, body: { service_id: 3, depends_on_service_id: 1, relationship_type: "runtime" } });
  check("circular dependency is rejected by trigger (400)", cycle.status === 400 && /circular/i.test(cycle.json.error ?? ""), cycle.json.error);
  const self = await call("/api/dependencies", { method: "POST", cookie: admin.cookie, body: { service_id: 3, depends_on_service_id: 3 } });
  check("self-dependency is rejected (400)", self.status === 400);
  const dup = await call("/api/dependencies", { method: "POST", cookie: admin.cookie, body: { service_id: 5, depends_on_service_id: 1 } });
  check("duplicate dependency → 409 (unique violation)", dup.status === 409, dup.json.error);

  const apiDel = await call("/api/apis/1", { method: "DELETE", cookie: admin.cookie });
  check("deleting an API that has consumers is blocked (409)", apiDel.status === 409 && apiDel.json.code === "HAS_CONSUMERS" && apiDel.json.consumers?.length > 0,
    apiDel.json.consumers?.map((c) => c.name).join(", "));
  const svcDel = await call("/api/services/1", { method: "DELETE", cookie: admin.cookie });
  check("deleting a service with dependents needs confirmation (409)", svcDel.status === 409 && svcDel.json.code === "HAS_DEPENDENTS");

  // ---------------------------------------------------------------- SQL injection handled safely
  const inj = encodeURIComponent("' OR 1=1; DROP TABLE issues; --");
  const s1 = await call(`/api/issues?search=${inj}`, { cookie: dev.cookie });
  check("SQL-injection string in search returns 0 rows, no error", s1.status === 200 && s1.json.total === 0);
  const s2 = await call(`/api/issues?status=${inj}`, { cookie: dev.cookie });
  check("SQL-injection string in status filter is rejected by enum validation (400)", s2.status === 400 && !/select|syntax|drop/i.test(s2.json.error ?? ""));
  const s3 = await call(`/api/issues?sort=${encodeURIComponent("created_date; DROP TABLE issues")}`, { cookie: dev.cookie });
  check("SQL in sort param is ignored (whitelist)", s3.status === 200 && s3.json.total > 0);
  const s4 = await call(`/api/issues?service_id=${inj}`, { cookie: dev.cookie });
  check("non-numeric id filter → 400, no SQL leaked", s4.status === 400 && !/select|syntax/i.test(JSON.stringify(s4.json)));
  const still = await call(`/api/issues?pageSize=1`, { cookie: dev.cookie });
  check("issues table still exists afterwards", still.status === 200 && still.json.total >= 20);

  // ---------------------------------------------------------------- impact analysis
  const imp = await call("/api/impact", { method: "POST", cookie: dev.cookie, body: { kind: "service", id: 8, changeType: "deprecation", depth: 5 } });
  check("impact of email-gateway via get_impact(): 5 services, max depth 4",
    imp.status === 200 && imp.json.services?.length === 5 && imp.json.maxDepth === 4, imp.json.services?.map((s) => `${s.name}@${s.depth}`).join(", "));
  const imp1 = await call("/api/impact", { method: "POST", cookie: dev.cookie, body: { kind: "api", id: 1, changeType: "breaking_api", depth: 1 } });
  check("impact of an API starts from its consumers", imp1.status === 200 && imp1.json.services?.every((s) => s.depth === 1) && imp1.json.services.length === 2);
  const deps5 = await call("/api/services/5/dependencies", { cookie: dev.cookie });
  const d5 = (deps5.json.dependencies ?? []).map((d) => `${d.name}@${d.depth}`);
  check("get_dependencies(order-service) includes email-gateway and user-profile-service at depth 2",
    deps5.status === 200 && d5.includes("email-gateway@2") && d5.includes("user-profile-service@2") && d5.filter((x) => x.endsWith("@1")).length === 4, d5.join(", "));
  const deps3 = await call("/api/services/3/dependencies", { cookie: dev.cookie });
  const depsNf = await call("/api/services/99999/dependencies", { cookie: dev.cookie });
  check("leaf service has no dependencies; unknown service → 404", deps3.status === 200 && deps3.json.dependencies.length === 0 && depsNf.status === 404);
  const sim = await call("/api/similar", { method: "POST", cookie: dev.cookie, body: { text: "customers charged twice when requests were retried" } });
  const top = sim.json.results ?? [];
  check("similar incidents (active engine): duplicate-charge incident in top 3, scores in 0..1",
    sim.status === 200 && top.slice(0, 3).some((r) => r.id === 2) && top.every((r) => r.score >= 0 && r.score <= 1),
    `engine=${sim.json.engine}; top: ${top.slice(0, 3).map((r) => `INC-${r.id} (${r.score})`).join(", ")}`);
} catch (e) {
  fail++;
  console.log("FAIL  unexpected error:", e.message, "(is the server running at", BASE + "?)");
} finally {
  // ---------------------------------------------------------------- cleanup (admin)
  const admin = await login("aarav@impactgraph.dev").catch(() => null);
  if (admin?.cookie) {
    if (created.issue) console.log(`cleanup: delete issue ${created.issue} →`, (await call(`/api/issues/${created.issue}`, { method: "DELETE", cookie: admin.cookie })).status);
    if (created.incident) console.log(`cleanup: delete incident ${created.incident} →`, (await call(`/api/incidents/${created.incident}`, { method: "DELETE", cookie: admin.cookie })).status);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
