# ImpactGraph — Team Work Split

The project is split by **layer**, so each person owns a complete, explainable part.
The two parts talk to each other only through the HTTP API (`/api/*`) and two shared
contract files (`lib/types.ts`, `lib/domain.ts`).

## Part 1 — Database & Backend (API)
Owns everything on the server side.

| Area | Files |
|---|---|
| Schema, data, advanced SQL | `schema.sql`, `seed.sql`, `advanced.sql`, `queries.sql` |
| Vector search (pgvector) | `pgvector_setup.sql`, `seed_incidents_extra.sql`, `similar_incidents_demo.sql`, `lib/embeddings.ts`, `lib/data/vector.ts`, `scripts/embed-incidents.ts` |
| Migrations / Docker | `migrations/`, `docker-compose.pgvector.yml` |
| Data-access layer (raw SQL) | `lib/db.ts`, `lib/data/*` |
| Auth & sessions | `lib/auth.ts`, `lib/session.ts`, `lib/revocation.ts`, `middleware.ts`, `app/api/auth/*` |
| REST API + validation | `app/api/**`, `lib/api.ts`, `lib/validators.ts` |
| Shared contract | `lib/types.ts`, `lib/domain.ts` |
| Automated tests | `scripts/smoke.mjs`, `scripts/smoke-vector.mjs` |
| Project scaffold & docs | `package.json`, `tsconfig.json`, `next.config.ts`, `README.md`, `docs/` |

**Can explain in viva:** ER/relational design, constraints, views, triggers, stored
function/procedure, recursive CTEs, transactions, JSONB + GIN, roles, pgvector/HNSW,
bcrypt + JWT + token revocation.

## Part 2 — Frontend (UI) & Testing report
Owns everything the user sees.

| Area | Files |
|---|---|
| Pages and routing | `app/(app)/**`, `app/login/`, `app/layout.tsx`, `app/not-found.tsx` |
| Reusable components | `components/**` (shell, command palette, tables, forms, dialogs, shadcn/ui) |
| Impact Explorer UI | `components/impact/*` (React Flow graph, drawer, report tabs) |
| Client helpers & styling | `lib/client.ts`, `lib/utils.ts`, `app/globals.css`, `postcss.config.mjs`, `components.json` |
| UI specification | `IMPACTGRAPH_SPEC.md`, `impactgraph-reference.png` |
| End-to-end test evidence | `E2E_TEST_REPORT.md` |

**Can explain in viva:** how each screen calls the API, role-based UI, the graph
(React Flow + dagre), responsive layout, global search, similar-incidents UI,
loading/empty/error states, and how the app was tested end to end.

## Push order
1. Part 1 creates the repo and pushes first (it contains `package.json` and the backend).
2. Part 2 clones, unzips on top, commits, and pushes.
