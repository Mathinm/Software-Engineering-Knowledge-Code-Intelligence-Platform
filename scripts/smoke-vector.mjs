#!/usr/bin/env node
// Vector-search smoke test (pgvector + local embeddings). Server must be running.
//   node scripts/smoke-vector.mjs [baseUrl]
//   EXPECT_MODEL_DISABLED=1 node scripts/smoke-vector.mjs http://localhost:3001
//     → against a server started with EMBEDDINGS_DISABLED=1: checks the keyword fallback.
// Talks to the API like the browser does, and to the database (DATABASE_URL in .env.local)
// to inspect embeddings. Everything it creates is deleted at the end.
import fs from "node:fs";
import pg from "pg";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const BASE = process.argv[2] ?? "http://localhost:3000";
const MODEL_DISABLED = process.env.EXPECT_MODEL_DISABLED === "1";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); };

async function call(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method, redirect: "manual",
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = {}; try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json, cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
const login = (email) => call("/api/auth/login", { method: "POST", body: { email, password: "Demo@1234" } });
const search = (cookie, body) => call("/api/similar", { method: "POST", cookie, body });
const embeddingOf = async (id) => (await db.query("SELECT embedding::text AS e FROM incidents WHERE incident_id = $1", [id])).rows[0]?.e ?? null;

const created = [];
await db.connect();
try {
  const admin = await login("aarav@impactgraph.dev");
  const dev = await login("rohan@impactgraph.dev");

  if (MODEL_DISABLED) {
    // ---------------------------------------------------- model unavailable → keyword fallback
    const r = await search(dev.cookie, { text: "payment provider timing out" });
    check("model disabled: text search falls back to full-text", r.status === 200 && r.json.engine?.startsWith("fulltext") && !!r.json.fallbackReason, `${r.json.engine}: ${r.json.fallbackReason}`);
    check("model disabled: no internal error text leaked", !/onnx|stack|EMBEDDINGS_DISABLED/i.test(JSON.stringify(r.json)));
    const n = await call("/api/incidents", { method: "POST", cookie: admin.cookie, body: { title: "[smoke-vector] write without model", severity: "low", service_id: 1 } });
    if (n.json.id) created.push(n.json.id);
    check("model disabled: creating an incident still succeeds, embedding left NULL", n.status === 200 && n.json.embedded === false && (await embeddingOf(n.json.id)) === null);
    const byInc = await search(dev.cookie, { incidentId: 1 });
    check("model disabled: search by incident still uses its STORED embedding (pgvector)", byInc.status === 200 && byInc.json.engine === "pgvector");
  } else {
    // ---------------------------------------------------- database layer
    const ext = (await db.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'")).rows[0];
    check("vector extension exists", !!ext, `version ${ext?.extversion}`);
    const dim = (await db.query("SELECT format_type(atttypid, atttypmod) AS t FROM pg_attribute WHERE attrelid = 'incidents'::regclass AND attname = 'embedding'")).rows[0]?.t;
    check("incidents.embedding is vector(384)", dim === "vector(384)", dim);
    const idx = (await db.query("SELECT indexdef FROM pg_indexes WHERE tablename = 'incidents' AND indexdef ILIKE '%hnsw%vector_cosine_ops%'")).rows.length;
    check("HNSW cosine index exists", idx === 1);
    const cov = (await db.query("SELECT count(*)::int AS total, count(embedding)::int AS embedded, min(vector_dims(embedding)) AS d FROM incidents")).rows[0];
    check("every incident has a 384-d embedding (after npm run embed)", cov.total > 0 && cov.total === cov.embedded && cov.d === 384, `${cov.embedded}/${cov.total}`);

    // ---------------------------------------------------- access control
    const anon = await search(undefined, { text: "timeout" });
    check("unauthenticated search → 401", anon.status === 401);
    const asDev = await search(dev.cookie, { text: "payment provider timing out" });
    const asAdmin = await search(admin.cookie, { text: "payment provider timing out" });
    check("developer and admin can both search", asDev.status === 200 && asAdmin.status === 200);

    // ---------------------------------------------------- semantic quality
    const top = asDev.json.results ?? [];
    check("engine is pgvector with all-MiniLM-L6-v2", asDev.json.engine === "pgvector" && /MiniLM/.test(asDev.json.model ?? ""));
    check("'payment provider timing out' → gateway-timeout incident (INC-1) in the top 3",
      top.slice(0, 3).some((h) => h.id === 1), top.slice(0, 3).map((h) => `INC-${h.id} ${h.score.toFixed(3)}`).join(", "));
    check("scores are within 0..1 and sorted descending",
      top.every((h) => h.score >= 0 && h.score <= 1) && top.every((h, i) => i === 0 || top[i - 1].score >= h.score));

    const byInc = await search(dev.cookie, { incidentId: 1, limit: 20 });
    check("search by incident uses its stored embedding and excludes itself",
      byInc.json.engine === "pgvector" && byInc.json.results.length > 0 && !byInc.json.results.some((h) => h.id === 1),
      `nearest: INC-${byInc.json.results?.[0]?.id} ${byInc.json.results?.[0]?.title}`);
    check("paraphrase found: nearest to INC-1 is INC-11 (different words, same failure)", byInc.json.results?.[0]?.id === 11);

    // ---------------------------------------------------- filters
    const svc = await search(dev.cookie, { text: "timeouts and failures", service_id: 3, limit: 20 });
    check("service filter (hybrid relational + vector)", svc.status === 200 && svc.json.results.length > 0 && svc.json.results.every((h) => h.service_id === 3));
    const sev = await search(dev.cookie, { text: "outage", severity: "critical", limit: 20 });
    check("severity filter", sev.status === 200 && sev.json.results.length > 0 && sev.json.results.every((h) => h.severity === "critical"));
    const lim = await search(dev.cookie, { text: "outage", limit: 3 });
    check("limit is honoured", lim.json.results?.length === 3);

    // ---------------------------------------------------- bad input
    const empty = await search(dev.cookie, { text: "   " });
    check("empty text → 400", empty.status === 400);
    const l0 = await search(dev.cookie, { text: "x", limit: 0 });
    const l999 = await search(dev.cookie, { text: "x", limit: 999 });
    check("limit 0 and 999 → 400", l0.status === 400 && l999.status === 400);
    const nan = await search(dev.cookie, { incidentId: "abc" });
    check("non-numeric incident id → 400", nan.status === 400);
    const missing = await search(dev.cookie, { incidentId: 999999 });
    check("unknown incident id → 404", missing.status === 404);
    const inj = await search(dev.cookie, { text: "'; DROP TABLE incidents; --" });
    const still = (await db.query("SELECT count(*)::int AS n FROM incidents")).rows[0].n;
    check("SQL-injection text is just text (200) and incidents table survives", inj.status === 200 && still > 0 && !/syntax|select/i.test(JSON.stringify(inj.json)));

    // ---------------------------------------------------- embeddings stay fresh
    const n = await call("/api/incidents", { method: "POST", cookie: admin.cookie, body: { title: "[smoke-vector] card processor not answering", description: "Checkout calls to the acquirer hang until they time out.", severity: "high", service_id: 1 } });
    created.push(n.json.id);
    const e1 = await embeddingOf(n.json.id);
    check("creating an incident stores an embedding in the same request", n.status === 200 && n.json.embedded === true && !!e1);
    const audit = (await db.query("SELECT new_value FROM audit_logs WHERE entity_type = 'incident' AND entity_id = $1 ORDER BY log_id", [n.json.id])).rows;
    check("audit_logs never contain the embedding", audit.length > 0 && audit.every((a) => !a.new_value || !("embedding" in a.new_value)));
    const found = await search(dev.cookie, { text: "acquirer hangs during checkout", limit: 3 });
    check("the new incident is immediately findable by meaning", found.json.results?.some((h) => h.id === n.json.id));

    await call(`/api/incidents/${n.json.id}`, { method: "PATCH", cookie: admin.cookie, body: { title: "[smoke-vector] stock reservation race" } });
    const e2 = await embeddingOf(n.json.id);
    check("editing the title re-embeds", !!e2 && e2 !== e1);
    await call(`/api/incidents/${n.json.id}`, { method: "PATCH", cookie: admin.cookie, body: { status: "investigating" } });
    const res = await call(`/api/incidents/${n.json.id}/resolve`, { method: "POST", cookie: admin.cookie, body: { root_cause: "Two workers reserved the same unit", resolution: "Row lock on stock reservation" } });
    const e3 = await embeddingOf(n.json.id);
    check("resolving via resolve_incident() re-embeds (root cause + resolution)", res.status === 200 && !!e3 && e3 !== e2);

    // ---------------------------------------------------- keyword fallback when embedding is NULL
    const nf = await call("/api/incidents", { method: "POST", cookie: admin.cookie, body: { title: "[smoke-vector] gateway timeout without vector", severity: "low", service_id: 1 } });
    created.push(nf.json.id);
    await db.query("UPDATE incidents SET embedding = NULL WHERE incident_id = $1", [nf.json.id]);
    const fb = await search(dev.cookie, { incidentId: nf.json.id });
    check("incident with NULL embedding → full-text fallback with a reason", fb.status === 200 && fb.json.engine?.startsWith("fulltext") && /no embedding/i.test(fb.json.fallbackReason ?? ""),
      `${fb.json.engine}; top: ${fb.json.results?.[0]?.title}`);
    const textNoNull = await search(dev.cookie, { text: "gateway timeout without vector", limit: 20 });
    check("rows with NULL embedding are skipped by vector search (no error)", textNoNull.status === 200 && !textNoNull.json.results.some((h) => h.id === nf.json.id));
  }
} catch (e) {
  fail++;
  console.log("FAIL  unexpected error:", e.message);
} finally {
  const admin = await login("aarav@impactgraph.dev");
  for (const id of created.filter(Boolean)) console.log(`cleanup: delete incident ${id} →`, (await call(`/api/incidents/${id}`, { method: "DELETE", cookie: admin.cookie })).status);
  await db.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
