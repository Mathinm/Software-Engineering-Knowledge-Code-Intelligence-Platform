# ImpactGraph: End-to-End Test Report

**Date:** 2026-10-15 · **App:** http://localhost:3000 (production build of commit `ef1044d`) · **DB:** Docker `impactgraph-pgvector` (PostgreSQL 16 + pgvector, host port 5433)

**How it was tested.** The Claude-in-Chrome extension could not connect: zero browsers were found after Chrome was opened, and `switch_browser` saw none either. With your approval I drove your **installed Google Chrome** (headed window, fresh temporary profile) through **playwright-core**, clicking, typing and reading the rendered pages as a user would. API-level checks used real login cookies, and every data check was cross-verified with SQL in the container.

- **Recording:** GIF/video recording needed Playwright's ffmpeg download, which I did not fetch. Each flow is documented with screenshots in `e2e-screenshots/` instead (35 PNGs, untracked).
- **Test data:** everything created was prefixed `E2E-TEST` and removed afterwards (see section 6).
- **Harness mistakes:** a few first-pass results came from my own wrong locators (an ambiguous `getByLabel`, Next.js's route announcer also being `role=alert`, reading the nav before client navigation finished). Those items were **re-run** with corrected selectors; only the re-run result is reported.

## Update — fixes applied (2026-10-15)

All 7 bugs below were fixed, one commit each, and re-verified in the same Playwright + installed-Chrome setup (scripts in the session scratchpad; screenshots were in `e2e-screenshots/fix1…fix5`, deleted after verification as requested). Final suites on the fixed build: `npm run smoke` **43/43** (40 original + 3 new), `npm run smoke:vector` **26/26**, `npx tsc --noEmit` 0 errors, `npm run lint` 0 problems.

| Bug | Status | Commit | Verified (in Chrome unless noted) |
|---|---|---|---|
| 1 Layout below desktop | **FIXED** | `654e474` | 390 / 768 / 1536 px on dashboard, services, service detail, graph, issues, incidents, incident detail, similar: `scrollWidth == clientWidth` on all 24 combinations; header 64 px (one row); <lg: sidebar hidden, hamburger drawer navigates and closes |
| 2 Logout didn't revoke token | **FIXED** | `f8a42b6` | copied cookie → Sign out → replay: 401 on /api/auth/me, /api/services, /api/dashboard, /api/issues; 307 → /login on pages; jti row added; /login with the revoked cookie renders (no loop); re-login works with a new token; rate limit still 429; bcrypt cost-6 → cost-12 rehash confirmed on Ananya's account |
| 3 No transitive "depends on" | **FIXED** | `aa1261b` | order-service "Depends on (all levels)" = Q9 = `get_dependencies(5)` (email-gateway@2, user-profile-service@2, 4 direct); auth-service shows "depends on no other service" |
| 4 Minimap covered nodes | **FIXED** | `36bafc2` | baseline reproduced (3 nodes under the minimap, drawer open); after fix 0 overlaps on 4 graphs × drawer closed/open/closed, every node inside the canvas, minimap renders all nodes |
| 5 Missing favicon | **FIXED** | `c8db189` | `/icon.svg` linked and served (200), no 404s in the network log |
| 6 Generic error for unknown ids | **FIXED** | `c8db189` | 10 bad URLs (e.g. /services/99999, /services/abc, /services/1.5, /issues/abc, /incidents/0, /repositories/x1) → **HTTP 404** "Not found" page inside the app shell with "Back to …" link; existing detail pages still 200; unknown path /no-such-page → 404 |
| 7 Tabs wrapping at 1536 px | **FIXED** | `654e474` | drawer open at 1536 px: graph toolbar 50 px, report tabs 46 px, drawer tabs 36 px — one row each (strips scroll horizontally if space runs out) |

Updated totals: **51 tests — 50 PASS, 0 FAIL, 1 BLOCKED** (H35 ADR editing — out of scope, not in the spec).

## 1. Summary (original run)

| Total | PASS | FAIL | BLOCKED |
|---:|---:|---:|---:|
| **51** | **48** | **2** | **1** |

The two FAILs are **D21** (no transitive "depends on" view) and **K46** (layout broken at mobile and tablet widths). The one BLOCKED item is **H35**: ADR create/edit/delete doesn't exist in the app. A further security issue found during A5 (the session token survives logout) is listed under Bugs, although A5 as written passes.

## 2. Results

Evidence column: **B** = seen in the real browser, **A** = HTTP API with a real session cookie, **S** = SQL cross-check.

| # | Test | Status | Evidence |
|---|---|---|---|
| A1 | Logged-out redirect | PASS | B: `/` → `/login`; `/impact` → `/login?next=%2Fimpact`. A: `/api/services` → 401 |
| A2 | Wrong password / unknown email | PASS | B: the same banner "Invalid email or password." for both, no stack trace; inline "Enter a valid email address." |
| A3 | Rate limiting | PASS | B: 6th failed attempt shows "Too many failed attempts. Try again in 15 minute(s)." (A: 429, Retry-After 900). Throwaway emails only, demo accounts never throttled |
| A4 | Admin login + refresh | PASS | B: after login and `reload()` still on the dashboard; header shows "Aarav Sharma" and the Admin badge |
| A5 | Logout | PASS | B: Sign out menu → `/login`, `ig_session` cookie removed, `/services` redirects again. Bug 2 (old token still valid) **FIXED** in `f8a42b6`: replay now → 401 |
| A6 | Developer restrictions | PASS | B (Diya): no Audit Log in nav; payment-service page has only tabs + "Simulate impact" (no Edit/Delete); `/audit` redirects with "only available to admins". `fetch` from the page: `/api/audit`, `/api/audit/flags`, DELETE service/API/issue all **403** |
| A7 | Other accounts | PASS | B: vikram → "Vikram Singh · Admin"; karthik → "Karthik Rao · Developer" |
| B8 | Stat cards vs SQL | PASS | B: open incidents 6, services 10, critical issues 2, MTTR 3.9 h, all equal SQL |
| B9 | Chart + tooltip | PASS | B: 12 bar segments; hovering shows "auth-service · Open / investigating 0 · Resolved 5"; 0 console errors on `/` |
| B10 | Activity feed | PASS | B: 8 rows; newest row's actor matches the newest `audit_logs` row |
| C11 | Services list | PASS | B: 10 rows; search "pay" → 2; status=deprecated → reporting-service; sort Open issues → [2,2,1,…] desc; `pageSize=4`: "1–4 of 10" → Next → "5–8 of 10" |
| C12 | Service detail | PASS | B: auth-service shows owner Karthik Rao, repo user-identity, Active, "Used by 4", tabs with counts; S: equals `v_service_overview` |
| C13 | Create + validation | PASS | B: empty name → "Name is required."; `auth-service` in user-identity → "A record with these values already exists." (409); `E2E-TEST-svc` created |
| C14 | Edit + audit | PASS | B: toast "Service updated."; S: `audit_logs` UPDATE by Aarav Sharma with the new description |
| C15 | Dependency + cycle | PASS | B: E2E-TEST-svc → auth-service added; auth-service → E2E-TEST-svc shows "Circular dependency: service 15 already depends (directly or indirectly) on service 3" in the dialog |
| C16 | Delete + cascade | PASS | B: in-app modal (no browser `confirm()`) lists cascades → deleted; S: row and edges gone, audit DELETE by Aarav Sharma |
| D17 | Graph interaction | PASS | B: 8 nodes, 11 edges, **0 overlapping node boxes**; zoom 47% → 56%; pan moved the viewport; drag moved a node −50/+90 px; minimap present; fit-to-screen works |
| D18 | auth-service impact | PASS | B: report = inventory@1, order@1, payment@1, user-profile@1, billing@2, notification@2, reporting@3; S: identical to `get_impact(3)`, paths start at auth-service |
| D19 | Leaf service | PASS | B: reporting-service → "may affect 0 services…", "No other service depends on it", risk Low |
| D20 | API + table impact | PASS | B: API Login → depth-1 consumers order-service, user-profile-service (= `service_api_usage`); table credentials → 8 services (= users ∪ owner ∪ `get_impact`) |
| D21 | "Depends on" vs recursive CTE | **FIXED** (`aa1261b`) | Originally FAIL: only direct edges were shown. Now the "Depends on (all levels)" panel (get_dependencies) equals Q9 for order-service, verified in Chrome |
| E22 | Issues filters/sort/search | PASS | B: critical → 4 (SQL 4); + in_progress → 2; inventory-service → 2; search "refund" → 1; sort by Severity desc → Critical×4 then High; pages "1–5 of 20" → "6–10 of 20" |
| E23 | Create issue + validation | PASS | B: empty submit → "Title is required. / Severity is required. / Service is required."; severity dropdown only offers the 4 valid values. A: `"urgent"` → 400 |
| E24 | Status change | PASS | B: "Move to In progress" → toast; S: `updated_date` NULL → set (trigger), audit UPDATE by **Diya Nair** |
| E25 | Delete permissions | PASS | B: reporter (developer) sees no Delete; page `fetch` DELETE → 403; admin deletes through the in-app modal. Linking issues to commits/APIs is not a feature |
| F26 | Incident list/detail | PASS | B: "Showing 1–20 of 30"; INC-1 shows root cause, resolution, service, owner, workflow, Find similar / Simulate impact |
| F27 | Create incident → embedding | PASS | B: "Report incident" dialog → INC-45; S: `embedding IS NOT NULL`, 384 dims |
| F28 | Resolve via procedure | PASS | B: no Resolve button while Open; Investigating → dialog; empty → "Root cause is required. / Resolution / fix applied is required."; filled → toast, button gone. S: status resolved, `resolved_date` set, audit by Aarav. Re-resolve → 400 "Incident 45 is already resolved". Used the E2E incident (seed data untouched) |
| G29 | "signed out … server time" | PASS | B: top card "INC-24 Refresh tokens rejected because of clock skew", **58% (0.581)** |
| G30 | "payment provider timing out" | PASS | B: top 3 = INC-11 provider timeouts, INC-1 gateway timeouts, INC-5 |
| G31 | Search by INC-1 + filter | PASS | B: INC-1 not in results; + payment-service filter → 4 cards, all payment-service |
| G32 | Bad/odd input | PASS | B: blank → inline error; 4990-char text → 200; textarea caps at 5000; quotes/unicode → 200; `'; DROP TABLE incidents;--` → 200; S: incidents intact |
| G33 | Engine label | PASS | B: banner and sidebar both say "Semantic search: pgvector, all-MiniLM-L6-v2" |
| H34 | ADRs/repos/devs + cross-links | PASS | B: 8 ADRs, 5 repos, 8 devs, 15 APIs, 13 tables; click-through payments-platform → payment-service → Issues tab → "#3 Slow query…"; ADR-1 detail |
| H35 | ADR create/edit/delete | BLOCKED | Not implemented: ADRs are read-only (POST `/api/adrs` → 405, no UI) |
| H36 | Developer commit counts | PASS | B: Commits column = SQL for all 8 developers (e.g. Ananya 7, Sneha 0); Ananya profile "Recent commits (7)" |
| I37 | Audit page + filters | PASS | B: banner "5 dependent services flagged for review"; entity=service + action=DELETE → only DELETE service rows; JSONB shown as `key: value` lines; actor filter works |
| I38 | E2E actions in audit | PASS | B: newest service row "Aarav Sharma DELETE service #15 name: E2E-TEST-svc…"; S: 24 E2E-tagged rows with correct actors (Aarav for admin actions, Diya for her issue) |
| I39 | No secrets in audit | PASS | B: 100 newest rows contain no password_hash, bcrypt string or embedding. S: 0 rows with `embedding` or `password_hash` keys |
| J40 | 401 / 403 | PASS | A: 17 routes without cookie → 401; 9 admin routes with developer cookie → 403 (also from the page with `fetch`, A6) |
| J41 | XSS / SQLi in inputs | PASS | B: issue titled `E2E-TEST <img src=x onerror=…> '; DROP TABLE issues;--` with a `<script>` description renders as literal text on the detail page, the list and the Ctrl+K palette; no `<img>` created, no script ran; issues table intact |
| J42 | Cookie flags | PASS | B: `ig_session` httpOnly=true, sameSite=Lax, secure=true, 8 h; `document.cookie` = "" (JWT not readable by JS) |
| J43 | Nonexistent IDs | PASS | Originally: generic error + Try again (Bug 6). **FIXED** in `c8db189`: real HTTP 404 "Not found" page with a link back |
| K44 | Console on every page | PASS | B: across all 12 nav pages and all flows, **no JS/React errors or warnings**. Only "Failed to load resource" for intentionally triggered 401/403/409/400/429/500, plus a favicon 404 (Bug 5) |
| K45 | Network failures | PASS | B: no unexpected 5xx. The only 500 was injected by the test (K47). 3× `ERR_ABORTED` = fetches cancelled by navigation (harmless) |
| K46 | Mobile / tablet | **FIXED** (`654e474`) | Originally FAIL (982 px page in a 375 px viewport). Now `scrollWidth == clientWidth` at 390/768/1536 px on 8 pages, verified in Chrome |
| K47 | Loading / empty / error states | PASS | B: skeleton (`aria-busy`) while the dashboard API is delayed 1.5 s; forced 500 → error panel + Try again, which recovers; no-hit search → "Nothing matches these filters"; Impact Explorer "No simulation yet" |
| K48 | Visual vs reference | PASS | Layout matches the reference structure; differences listed in section 5 |
| K49 | Navigation + history | PASS | B: all 12 sidebar links load with exactly one matching active item; back/back/forward render correctly; filters survive Back |
| L50 | Smoke suites | PASS | `npm run smoke` **40/40**, `npm run smoke:vector` **26/26** |
| L51 | tsc + lint | PASS | `npx tsc --noEmit` 0 errors; `npm run lint` 0 problems |

Also checked: "Expand next level" re-runs at depth 2 and the slider follows (B); a click on a graph node opens the drawer with the correct owner and repo (B); developers can use Similar Incidents (B).

## 3. Bugs found (most severe first)

1. **FIXED `654e474` — High: layout breaks below desktop width.**
   - *Page:* every page (seen on `/`, `/impact`, `/issues`, `/similar`).
   - *Steps:* sign in, resize the window to 390×844 (or 768×1024).
   - *Expected:* the sidebar collapses or becomes a drawer, content fills the width, no horizontal scroll.
   - *Actual:* the 240 px sidebar and fixed-width header stay; the page is 982 px wide, `main` shrinks to 135 px (390 px) or 513 px (768 px), and text wraps one word per line (`e2e-screenshots/K46-mobile-390-_impact.png`).
   - *Suspected:* `components/shell/app-shell.tsx`, where the sidebar is always `w-60` or `w-[72px]` with no breakpoint, the logo box is `w-56`, and the header items don't shrink.
2. **FIXED `f8a42b6` — Medium: logout does not revoke the session token.**
   - *Steps:* sign in, copy the `ig_session` value, sign out, then send a request with the old value in a `Cookie` header.
   - *Expected:* 401.
   - *Actual:* 200 for up to 8 h; logout only deletes the browser cookie.
   - *Suspected:* `lib/session.ts`, `app/api/auth/logout/route.ts` (stateless JWT, no deny-list or per-user token version).
3. **FIXED `aa1261b` — Medium: no transitive "depends on" view (D21).**
   - *Page:* `/services/5?tab=dependencies`.
   - *Expected:* a view matching the recursive CTE (queries.sql Q9), including email-gateway and user-profile-service at depth 2.
   - *Actual:* only the 4 direct edges. Impact Explorer covers the reverse direction only (who is affected).
   - *Suspected:* `lib/data/services.ts` → `getServiceDependencies()`, `app/(app)/services/[id]/page.tsx`.
4. **FIXED `36bafc2` — Low: minimap covers graph nodes when the drawer is open.**
   - *Page:* `/impact`.
   - *Steps:* simulate payment-service, then click order-service.
   - *Expected:* all nodes visible.
   - *Actual:* the minimap sits on top of billing-service, and the toolbar's fit button wraps to a second line (`e2e-screenshots/K48-impact-vs-reference.png`).
   - *Suspected:* `components/impact/impact-graph.tsx` (MiniMap position, `fitView` padding).
5. **FIXED `c8db189` — Low: missing favicon.**
   - *Every page:* `GET /favicon.ico` → 404, so a console error on each load.
   - *Suspected:* no `app/icon.*` / `app/favicon.ico`.
6. **FIXED `c8db189` — Low: unknown IDs show a generic error, not "not found".**
   - *Page:* `/services/99999`, `/issues/abc`.
   - *Expected:* a not-found message and a link back.
   - *Actual:* "Something went wrong" + **Try again**, which just refetches the same 404 or 400.
   - *Suspected:* `components/common.tsx` (`ErrorState`), detail pages.
7. **FIXED `654e474` — Low: tabs wrap at 1536 px with the drawer open.**
   - *Page:* `/impact`.
   - *Actual:* the drawer tab "ADRs" and the report tab "Suggested tests" drop to a second row, and the Owner column wraps names.
   - *Suspected:* `components/impact/node-drawer.tsx`, `components/impact/report.tsx`.
8. **Info: features the plan expected but the app doesn't have.**
   - ADR create/edit/delete (H35).
   - Linking an issue to a commit or API (E25).

## 4. Console errors and failed network calls

| Group | Count | Notes |
|---|---:|---|
| JS exceptions / React errors / warnings | **0** | none on any page |
| `401 /api/auth/login` | 9 | intentional wrong-password / rate-limit tests |
| `429 /api/auth/login` | 2 | intentional rate-limit tests |
| `403` (audit, flags, DELETE service/API/issue) | 6 | intentional developer-permission tests |
| `409 /api/services` POST | 1 | intentional duplicate service |
| `400 /api/dependencies` POST | 1 | intentional cycle |
| `400 /api/incidents/:id/resolve` | 1 | intentional re-resolve |
| `404 /api/services/99999`, `400 /api/issues/abc` | 2 | intentional not-found tests |
| `500 /api/services` | 1 | **injected by the test** (route mock) to check the error state |
| `404 /favicon.ico` | each page load | **real**: Bug 5 — FIXED `c8db189` (app/icon.svg) |
| `net::ERR_ABORTED` | 3 | fetches cancelled by navigation (`/api/adrs`, `/api/lookups`, `/api/audit/flags`), harmless |

No unexpected 5xx responses, and the server log shows no unhandled errors.

## 5. Differences from `impactgraph-reference.png`

Compared using `e2e-screenshots/K48-impact-vs-reference.png` (payment-service, drawer on order-service).

- **Same:** header (logo, Ctrl K search, theme toggle, role badge, avatar), sidebar order with Settings at the bottom, breadcrumb, headline banner + separate risk card, Change Simulation panel, 3 metric cards with direct/indirect split, graph toolbar, legend strip, right drawer, and report tabs with counts + Export report.
- **Graph layout:** left-to-right dagre with the changed component on the left. The reference centres it, with consumers on the left and dependencies on the right.
- **Role badge:** static badge plus an account menu with Sign out, not a role dropdown (intentional, since roles are real).
- **Avatars:** initials, not photos. The drawer has no "Language" field (intentional, as the schema has no such column).
- **Wrapping:** with the drawer open, the toolbar, drawer tabs and report tabs wrap onto two rows (Bug 7), and the minimap overlaps a node (Bug 4).
- **Colours follow the data:** the headline is amber when risk is Medium; the reference shows the red High state.
- **Graph density:** smaller, because the real database has 10 services instead of the reference's ~14 affected.

## 6. Cleanup confirmation

| Table | Before | After |
|---|---:|---:|
| developers | 8 | 8 |
| repositories | 5 | 5 |
| commits | 24 | 24 |
| services | 10 | 10 |
| apis | 15 | 15 |
| database_tables | 13 | 13 |
| issues | 20 | 20 |
| incidents | 30 | 30 |
| adrs | 8 | 8 |
| **audit_logs** | **79** | **121** |
| service_dependencies | 13 | 13 |
| service_api_usage | 13 | 13 |
| service_table_usage | 19 | 19 |
| incidents with embedding | 30 | 30 |

- **Leftovers:** 0 rows named `E2E-TEST%` remain (services, issues, incidents, dependencies). The 30 seed incidents all still have embeddings, and email-gateway is still in maintenance.
- **audit_logs +42:** expected and kept. The audit trigger is append-only and recorded every E2E create/edit/delete (24 rows mention E2E-TEST; the rest come from the two smoke suites). They were not deleted, to keep the audit trail honest; say the word if you want them removed.
- **Not touched:** no DROP, TRUNCATE or `docker compose down -v` was run. The native PostgreSQL on 5432 was not used.
