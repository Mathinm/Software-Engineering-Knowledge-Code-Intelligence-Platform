# ImpactGraph

**Software Engineering Knowledge & Code Intelligence Platform**, PES University DBMS project (Level 3).

ImpactGraph answers one question: *"If I change this service, API or database table, what else could break?"*
It is a full-stack Next.js app on top of a real PostgreSQL database. Every screen reads and writes through API routes that run raw, parameterized SQL (no ORM). Authentication is real: bcrypt password hashes, signed JWT sessions, and role checks enforced on the server.

## Tech stack

| Layer | Technology |
|---|---|
| UI | Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · lucide-react |
| Graph / charts / tables | @xyflow/react (React Flow) + dagre · Recharts · TanStack Table |
| API | Next.js route handlers (`app/api/**/route.ts`) · zod validation |
| Data access | `pg` with raw SQL, one named function per query (`lib/data/*.ts`) |
| Auth | bcryptjs · jose (HS256 JWT, 8 h) in an httpOnly cookie · `middleware.ts` |
| Database | PostgreSQL 14+ (tested on 18 natively, and on 16 + pgvector in Docker): `schema.sql`, `seed.sql`, `advanced.sql`, `queries.sql`, `pgvector_setup.sql` |
| Vector search | pgvector (HNSW, cosine) · local embedding model `Xenova/all-MiniLM-L6-v2` via `@huggingface/transformers` (no paid API) |

## 1. Install

Prerequisites: **Node.js 20+** and **PostgreSQL** with the `impactgraph` database already created and loaded:

```bash
createdb impactgraph
psql -d impactgraph -f schema.sql
psql -d impactgraph -f seed.sql
psql -d impactgraph -f advanced.sql
psql -d impactgraph -f queries.sql     # optional: the demo queries
```

Then install the app:

```bash
npm install
```

## 2. Configure `.env.local`

Copy the example and fill in your own values. `.env.local` is git-ignored, so never commit it.

```bash
cp .env.example .env.local
```

```ini
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/impactgraph
JWT_SECRET=<a long random string>
```

Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### Apply the migrations (any database you point the app at)

```bash
psql -d impactgraph -f migrations/002_session_revocation.sql   # revoked_tokens (required: logout + every signed-in request use it)
psql -d impactgraph -f migrations/003_get_dependencies.sql     # get_dependencies() (required: service "Depends on (all levels)")
```

Both files are idempotent and already contained in `schema.sql` / `advanced.sql` for fresh builds. `001_optional_pg_trgm.sql` is optional.

## 3. Run

```bash
npm run dev            # development, http://localhost:3000
# or
npm run build && npm start
```

Checks:

```bash
npx tsc --noEmit       # type check
npm run lint           # ESLint
npm run smoke          # end-to-end API test (server must be running)
npm run smoke:vector   # vector-search test (needs the pgvector database, see section 9)
```

## 4. Demo logins

All demo users share the password **`Demo@1234`**. The login page has *Fill demo Admin* and *Fill demo Developer* buttons; they only fill in the form.

| Role | Accounts |
|---|---|
| **Admin** | `aarav@impactgraph.dev`, `vikram@impactgraph.dev` |
| **Developer** | `diya@`, `rohan@`, `sneha@`, `karthik@`, `ananya@`, `meera@impactgraph.dev` |

> The seed stores bcrypt hashes with cost 6 (`gen_salt('bf')`). On the first successful login each hash is **upgraded to cost 12** automatically, so `developers.password_hash` changes after you sign in. The password stays `Demo@1234`.

**What each role can do** (enforced in the API routes, not only hidden in the UI):

| Action | Admin | Developer |
|---|:-:|:-:|
| View everything, run impact simulations, search, similar incidents | ✅ | ✅ |
| Report issues and incidents | ✅ | ✅ |
| Change an issue's status | ✅ any | only issues they reported, or on services they maintain |
| Resolve an incident (`resolve_incident`) | ✅ any | only on services they maintain |
| Create / edit / delete services, APIs, tables, dependencies, usages | ✅ | ❌ |
| Edit fields of / delete issues and incidents | ✅ | ❌ |
| Audit Log | ✅ | ❌ (403 / redirect) |

## 5. Which SQL feature powers which screen

| Screen / behaviour | SQL feature (file) | Where in the code |
|---|---|---|
| **Impact Explorer**: affected services, depth, path | **Recursive CTE stored function** `get_impact(service_id)` (advanced.sql) | `lib/data/impact.ts` → `affectedServices()` |
| Service page: "Depends on (all levels)" | **Recursive CTE stored function** `get_dependencies(service_id)` with depth, path and cycle guard (advanced.sql 3b / migrations/003); `GET /api/services/:id/dependencies` | `lib/data/services.ts` → `getAllDependencies()` |
| Logout really ends the session | `revoked_tokens(jti PK, expires_at)` table (schema.sql / migrations/002): logout inserts the token's `jti`, every request checks it, expired rows are pruned | `lib/revocation.ts`, `lib/api.ts` → `currentUser()` |
| Impact of an **API / table** | `service_api_usage` / `service_table_usage` joins + `CROSS JOIN LATERAL get_impact(...)` | `lib/data/impact.ts` |
| Services list, node drawer, risk counts | **View** `v_service_overview` (advanced.sql) | `lib/data/services.ts` → `listServices()` |
| Resolve incident button | **Stored procedure** `resolve_incident(...)` with `FOR UPDATE` row lock (advanced.sql) | `lib/data/work.ts` → `resolveIncident()` |
| Audit Log + Recent activity | **Trigger** `fn_audit_row` on services/issues/incidents/adrs, writing **JSONB** old/new values | every write runs in `withTx()` (`lib/db.ts`), which does `set_config('app.current_user_id', …, true)` |
| "N dependent services flagged for review" | **JSONB containment** `new_value @> '{"status":"deprecated"}'` (GIN index) + `get_impact()` | `lib/data/insights.ts` → `reviewFlags()` |
| Adding a dependency that creates a loop is rejected | **Trigger** `trg_no_dependency_cycle` (recursive CTE) → `RAISE EXCEPTION` → HTTP 400 | `lib/data/services.ts` → `addDependency()` |
| Issue "Updated" time | **Trigger** `trg_issues_touch` (BEFORE UPDATE) | automatic |
| Form validation errors (bad severity, duplicate, self-dependency) | **CHECK / UNIQUE / FK constraints** → mapped to 400 / 409 | `lib/api.ts` → `pgToApiError()` |
| Dashboard cards (open incidents, critical issues, MTTR) | **Aggregates**, `avg(EXTRACT(EPOCH FROM resolved_date - created_date))` | `lib/data/insights.ts` → `dashboardSummary()` |
| Incidents-by-service chart | `GROUP BY` + `count(*) FILTER (WHERE …)` + `HAVING` | `incidentsPerService()` |
| Hotspots | correlated subqueries over commits (90-day window) + issues | `hotspots()` |
| Bus-factor warnings | CTEs + `GROUP BY` + `NOT EXISTS` (single contributor) | `busFactor()` |
| Issues & Incidents table | multi-table **JOINs**, dynamic `WHERE` with numbered params, `count(*) OVER ()` **window function** for server-side pagination | `lib/data/work.ts`, `lib/data/paging.ts` |
| Similar Incidents (semantic) | **pgvector**: `vector(384)` column, **HNSW** index with `vector_cosine_ops`, `ORDER BY embedding <=> $1::vector LIMIT n`, optional `service_id`/`severity` filters in the same query (hybrid relational + vector) | `lib/data/vector.ts`, `lib/embeddings.ts` |
| Similar Incidents (fallback) | **Full-text search**: `tsvector` with `setweight`, `plainto_tsquery`, `ts_rank_cd(…, 32)` (0–1); pg_trgm `similarity()` if installed. Used when pgvector or the model is unavailable | `lib/data/insights.ts` → `findSimilarIncidents()` |
| Global search (Ctrl/Cmd + K) | `ILIKE` with escaped `%`/`_` across 5 tables | `globalSearch()` |
| Developers pages never leak `password_hash` | explicit column lists (mirrors the `app_readonly` column-level GRANT in advanced.sql) | `lib/data/catalog.ts` → `DEV_COLS` |

## 6. Project layout

```
app/
  login/                    login page
  (app)/                    signed-in pages (dashboard, impact, services, apis, tables, issues, incidents,
                            similar, repositories, developers, adrs, audit, settings)
  api/**/route.ts           API routes (auth, CRUD, impact, search, similar, audit, dashboard)
components/                 shell, shared UI, impact graph/drawer/report, forms, tables
lib/
  db.ts                     pg pool, q(), withTx(userId, fn)
  api.ts                    route() wrapper: auth, role check, zod + Postgres error → JSON
  auth.ts / session.ts      bcrypt login + rate limit / JWT sign + verify
  domain.ts                 enums (match CHECK constraints), workflows, risk rule, permission rules
  data/*.ts                 ALL SQL lives here, one named function per query
  validators.ts             zod schemas for every request
middleware.ts               redirects / 401s for anonymous users, blocks /audit for developers
scripts/smoke.mjs           end-to-end API test
scripts/smoke-vector.mjs    vector-search test
scripts/embed-incidents.ts  batch embedding (npm run embed)
lib/embeddings.ts           the one embedding function (model singleton)
docker-compose.pgvector.yml PostgreSQL 16 + pgvector on host port 5433
pgvector_setup.sql, seed_incidents_extra.sql, similar_incidents_demo.sql
migrations/001_optional_pg_trgm.sql   optional, not required
migrations/002_session_revocation.sql revoked_tokens table (required)
migrations/003_get_dependencies.sql   get_dependencies() function (required)
```

## 7. Design decisions worth knowing

- **One simulation result.** `POST /api/impact` returns one `ImpactResult`. The headline, metric cards, risk badge, graph and every report tab render from that same object.
- **One risk rule** (`classifyRisk` in `lib/domain.ts`), used by the server and shown in the UI tooltip:
  **High**: more than 5 affected services, or at least one open critical issue/incident among the changed and affected services. **Medium**: 2–5 affected services, or any open high-severity item. **Low**: everything else.
- **Workflows are forward-only, one step at a time**: issue `open → in_progress → resolved → closed`; incident `open → investigating → resolved`. The server locks the row (`FOR UPDATE`) and checks the transition. Resolving an incident always goes through `resolve_incident`.
- **No silent cascades.** Deleting an API with consumers is always blocked (409 with links to the consumers). Deleting a table that other services use is blocked the same way. Deleting a service that others depend on needs an explicit confirmation, and the dialog lists what the FKs will cascade.
- **Errors.** `23505`/`23503` → 409, `23514`/`22P02` → 400, `RAISE EXCEPTION` (P0001) → 400 with the message. Other errors return a generic 500 and are logged on the server only. Stack traces and SQL never reach the client.
- **Logout revokes the token.** Each session JWT has a random `jti`; logout stores it in `revoked_tokens` until the token would expire, and `currentUser()` rejects listed tokens on every API route and page. (The edge middleware only checks signatures, so it never redirects away from `/login`; the login page asks `/api/auth/me` instead.) Tokens issued before this change have no `jti` and are rejected, so users sign in again once.
- **Not found.** Detail pages for services, issues, incidents, ADRs, repositories and developers validate the id on the server: malformed or unknown ids return a real HTTP 404 with a link back to the list.
- **Login safety.** The same message is returned for an unknown email and a wrong password (a dummy bcrypt compare keeps timing similar). There are 5 failures per 15 minutes per IP + email; the limiter is in-memory, so it resets on restart.
- **Hotspot window.** The seed's newest commit is from mid-2026, so "the last 90 days" is measured up to the **latest recorded commit** rather than `now()`. Otherwise every count would be 0.

## 8. Known limits of the demo data

The data comes from your database and none of it is invented, so some screens are smaller than the spec imagined:

- **10 services** (the spec suggested ~30). The longest dependency chain is 4 levels (`email-gateway → notification-service → payment-service → billing-service → reporting-service`).
- **Bus factor:** no repository has a single committer, so the "single contributor" list is empty. The dashboard instead shows *knowledge concentration* (one person wrote ≥ 75% of a repo's commits).
- **Similar incidents:** on the native database (10 incidents, no pgvector) matches are keyword-based and sometimes weak. On the Docker pgvector database there are 30 incidents (`seed_incidents_extra.sql`) and search is semantic. In our test, 9 of the 10 paraphrased incidents found their original as nearest neighbour; the miss was "Overselling when two shoppers buy the last unit" (#16), whose nearest match was a double-billing incident instead of "Negative stock levels" (#6).

## 9. Vector search (pgvector)

**What an embedding is.** An embedding is a list of numbers (here 384) that a language model produces for a piece of text, placed so that texts with similar *meaning* get nearby vectors. "Timeouts calling the payment provider under load" and "Payment gateway timeouts causing failed charges" share few words but get vectors with cosine similarity 0.69, so they are found together.

**Why cosine distance and HNSW.** The model outputs L2-normalised vectors, so the angle between them (cosine) is the natural measure. pgvector's `<=>` operator is cosine distance, and the app shows `1 − distance` (clamped to 0–1) as the similarity. HNSW is a graph index for approximate nearest-neighbour search. Unlike ivfflat it needs no training step and works well on a small table. `similar_incidents_demo.sql` shows `EXPLAIN` using it.

### Start the database (Docker Desktop)

The container is published on host port **5433**, so it never conflicts with a native PostgreSQL on 5432. The password is not in any committed file; put it in `.env.local` as `POSTGRES_PASSWORD=...` and let compose read it from there:

```bash
docker compose --env-file .env.local -f docker-compose.pgvector.yml up -d
docker compose --env-file .env.local -f docker-compose.pgvector.yml ps      # wait for "healthy"
```

### Load the data (in this order)

The repo folder is mounted read-only at `/sql` inside the container:

```bash
for f in schema.sql seed.sql advanced.sql pgvector_setup.sql seed_incidents_extra.sql; do
  docker compose --env-file .env.local -f docker-compose.pgvector.yml exec -T db     psql -U postgres -d impactgraph -v ON_ERROR_STOP=1 -f /sql/$f
done
```

(On Git Bash for Windows, prefix with `MSYS_NO_PATHCONV=1` so `/sql/...` is not rewritten into a Windows path.) `pgvector_setup.sql` and `seed_incidents_extra.sql` are safe to run twice.

### Point the app at it

```ini
DATABASE_URL=postgres://postgres:<POSTGRES_PASSWORD>@localhost:5433/impactgraph
```

### Create the embeddings

```bash
npm run embed            # incidents WHERE embedding IS NULL
npm run embed -- --all   # re-embed every incident
```

The first run downloads the model (about 87 MB) into the git-ignored `.cache/` folder. On our connection that took 325 s; after that the model loads in under a second and 30 incidents embed in under a second. New and edited incidents (create, title/description edit, `resolve_incident`) are re-embedded in the same API request. If the model fails, the write still succeeds, `embedding` stays NULL, and the error is only logged on the server.

### What the app does at runtime

| Situation | Engine shown on the page |
|---|---|
| pgvector + embeddings available | **Semantic search: pgvector, all-MiniLM-L6-v2** |
| Searching by an incident that has no embedding yet | Keyword search: full-text fallback (reason shown) |
| Model cannot load (tested with `EMBEDDINGS_DISABLED=1`) | Keyword search for typed text; incident-to-incident search still uses stored vectors |
| Database without pgvector (e.g. the native one on 5432) | Keyword search: full-text fallback |

`similar_incidents_demo.sql` has labelled demo queries: nearest neighbours, a hybrid relational filter, a similarity threshold, the three distance operators (`<->`, `<=>`, `<#>`), `EXPLAIN` with the HNSW index, and aggregates over similarity.
