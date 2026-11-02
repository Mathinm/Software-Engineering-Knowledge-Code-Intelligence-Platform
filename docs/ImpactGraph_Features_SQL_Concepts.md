# ImpactGraph — Feature → SQL → DBMS Concept

One section per UI feature: **what it does**, **the SQL that runs in the backend**, **the DBMS concept**.

**How to read the SQL.** `$1, $2…` are parameters the app passes through the `pg` driver (parameterised queries, so no SQL injection). The queries below were run against the project schema + seed data and all return correct results. The app's exact query text can differ in formatting or column aliases. Items marked ⚠ were not run in my test copy (they need pgvector or the migration files that live on your machine) and are written from the design.

---

## Concept index (use this for viva answers)

| DBMS concept | Where it shows up |
|---|---|
| JOINs (2–4 tables) | Every list page, drawer, detail tabs |
| GROUP BY / HAVING / aggregates | Dashboard cards and chart, Owners tab, Developers |
| Subqueries (scalar, correlated, EXISTS) | Hotspots, bus factor, summary counts |
| Window functions | Risk ranking, cumulative incidents (queries.sql Q6, Q7) |
| **Recursive CTE** | Impact Explorer, "Depends on (all levels)" |
| Views | `v_service_overview`, `v_priority_issues` |
| Stored function | `get_impact()`, `get_dependencies()` ⚠ |
| Stored procedure + transaction | `resolve_incident()` |
| Triggers | Audit log, `updated_date`, circular-dependency block |
| Constraints (PK, FK, UNIQUE, CHECK, NOT NULL) | Every create/edit form, delete blocking |
| Referential actions (CASCADE / RESTRICT) | Deleting services, developers |
| Indexes (B-tree, GIN, HNSW) | Graph traversal, JSONB search, vector search |
| JSONB (semi-structured data) | Audit log old/new values |
| Vector search (pgvector) | Similar Incidents |
| Full-text search | Keyword fallback |
| Row locking / concurrency | `FOR UPDATE` in `resolve_incident` |
| Authentication + DB roles / least privilege | Login, `app_admin`, `app_readonly` |

---

## 1. Login and roles

**What it does.** Checks the email and password, starts a session (JWT in an httpOnly cookie), and decides whether you are Admin or Developer. Admin-only pages and actions are blocked on the server, not just hidden.

```sql
-- find the account
SELECT developer_id, name, email, auth_role, password_hash
FROM developers
WHERE email = $1;
-- The app compares the password with bcrypt in code, never in SQL.

-- on success, upgrade an old hash to cost 12
UPDATE developers SET password_hash = $2 WHERE developer_id = $1;

-- ⚠ on every request: reject logged-out tokens (migration 002)
SELECT 1 FROM revoked_tokens WHERE jti = $1;
-- ⚠ on logout
INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, $2);
```

**Concept.** Constraints (`email UNIQUE`, `auth_role CHECK IN ('admin','developer')`), password hashing (never plaintext), and role-based access control. The DB also has its own roles (see section 15).

---

## 2. Dashboard — the four summary cards

**What it does.** Shows open incidents, total services, critical issues and average time to resolve. Clicking a card opens the filtered list.

```sql
SELECT
  (SELECT count(*) FROM incidents WHERE status <> 'resolved')                         AS open_incidents,
  (SELECT count(*) FROM services)                                                     AS total_services,
  (SELECT count(*) FROM issues
     WHERE severity = 'critical' AND status IN ('open','in_progress'))                AS critical_issues,
  (SELECT round(avg(EXTRACT(EPOCH FROM (resolved_date - created_date)) / 3600)::numeric, 1)
     FROM incidents WHERE status = 'resolved')                                        AS mttr_hours;
```

**Concept.** Aggregate functions (`count`, `avg`), scalar subqueries, date/time arithmetic on `TIMESTAMP`. MTTR = mean time to resolve.

---

## 3. Dashboard — incidents-by-service bar chart

**What it does.** One bar per service showing how many incidents it has had.

```sql
SELECT s.name AS service, count(n.incident_id) AS incidents
FROM services s
LEFT JOIN incidents n ON n.service_id = s.service_id
GROUP BY s.service_id, s.name
ORDER BY incidents DESC, s.name;
```

**Concept.** `LEFT JOIN` (keeps services with zero incidents), `GROUP BY`, aggregation. The index `idx_incidents_service` speeds the join.

---

## 4. Dashboard — hotspot table

**What it does.** Ranks services by recent commit activity and open bugs. Lots of change plus lots of bugs means high risk.

```sql
SELECT s.name,
  (SELECT count(*) FROM commits c
     WHERE c.repo_id = s.repo_id
       AND c."timestamp" > now() - interval '90 days')            AS recent_commits,
  (SELECT count(*) FROM issues i
     WHERE i.service_id = s.service_id
       AND i.status IN ('open','in_progress'))                    AS open_bugs
FROM services s
ORDER BY open_bugs DESC, recent_commits DESC;
```

**Concept.** Correlated subqueries (each subquery refers to the outer row `s`). Note: commits belong to a repository, and services map to a repository through `repo_id`. If the seed commits are older than the window, `recent_commits` shows 0; that is the data, not a bug.

---

## 5. Dashboard — bus-factor warning

**What it does.** Lists services where only one person has contributed, because the knowledge is concentrated.

```sql
SELECT s.name AS service, d.name AS maintainer,
       (SELECT count(DISTINCT c.author_id) FROM commits c WHERE c.repo_id = s.repo_id) AS contributors
FROM services s
JOIN developers d ON d.developer_id = s.maintainer_id
WHERE (SELECT count(DISTINCT c.author_id) FROM commits c WHERE c.repo_id = s.repo_id) <= 1;
```

**Concept.** Correlated subquery with `COUNT(DISTINCT …)` in the `WHERE` clause. With the current seed data every repo has several contributors, so the list is empty by design (the empty state shows).

---

## 6. Dashboard — recent activity feed

**What it does.** Shows the latest changes: who did what, to what, and when.

```sql
SELECT a.log_id, d.name AS actor, a.action, a.entity_type, a.entity_id, a."timestamp"
FROM audit_logs a
JOIN developers d ON d.developer_id = a.performed_by
ORDER BY a."timestamp" DESC
LIMIT 10;
```

**Concept.** JOIN + `ORDER BY … LIMIT`. The rows were written automatically by triggers (section 14).

---

## 7. Impact Explorer — "Simulate Change" (the main feature)

**What it does.** You pick a component and a depth. The app finds every service that would break, level by level, together with the path that connects them.

```sql
-- the stored function (defined in advanced.sql)
SELECT * FROM get_impact($1);               -- $1 = selected service_id

-- depth slider: keep only levels up to the chosen depth
SELECT * FROM get_impact($1) WHERE depth <= $2;
```

Inside `get_impact`:

```sql
WITH RECURSIVE impact AS (
    -- anchor: services that depend directly on the selected one
    SELECT d.service_id AS sid, 1 AS lvl,
           ARRAY[d.depends_on_service_id, d.service_id] AS trail
      FROM service_dependencies d
     WHERE d.depends_on_service_id = p_service_id
    UNION ALL
    -- recursive step: services that depend on the ones already found
    SELECT d.service_id, i.lvl + 1, i.trail || d.service_id
      FROM service_dependencies d
      JOIN impact i ON d.depends_on_service_id = i.sid
     WHERE d.service_id <> ALL (i.trail)            -- cycle guard
),
nearest AS (                                        -- keep the shortest path per service
    SELECT DISTINCT ON (sid) sid, lvl, trail FROM impact ORDER BY sid, lvl
)
SELECT … FROM nearest n JOIN services s ON s.service_id = n.sid ORDER BY n.lvl, s.name;
```

**Concept.** **Recursive CTE** (`WITH RECURSIVE`) for graph traversal over a self-referencing many-to-many table. It is wrapped in a **stored function**. The array `trail` plus `<> ALL(trail)` prevents infinite loops. `DISTINCT ON` picks the nearest path. The indexes `idx_svc_dep_from` and `idx_svc_dep_to` make each step fast.

---

## 8. Impact Explorer — summary sentence, metrics and risk badge

**What it does.** Produces "may affect N services, M tables…", the three metric tiles, and the High/Medium/Low badge. All numbers come from one result set.

```sql
WITH impacted AS (
    SELECT impacted_id FROM get_impact($1) WHERE depth <= $2
)
SELECT
  (SELECT count(*) FROM impacted)                                           AS services_affected,
  (SELECT count(DISTINCT table_id) FROM service_table_usage
     WHERE service_id IN (SELECT impacted_id FROM impacted))                AS tables_affected,
  (SELECT count(*) FROM incidents
     WHERE status <> 'resolved'
       AND service_id IN (SELECT impacted_id FROM impacted))                AS open_incidents,
  (SELECT count(*) FROM incidents
     WHERE severity = 'critical' AND status <> 'resolved'
       AND service_id IN (SELECT impacted_id FROM impacted))                AS critical_incidents;
```

The risk rule is applied on those counts, for example: **High** if more than 10 services are affected or there is at least one critical open incident; **Medium** for 4–10 services; **Low** otherwise. The same rule is shown in the badge tooltip.

**Concept.** Non-recursive CTE reused by several subqueries, `IN (subquery)`, `COUNT(DISTINCT)`. Using one CTE guarantees the sentence, tiles and graph can never disagree.

---

## 9. Impact Explorer — the dependency graph

**What it does.** Draws the selected service and the affected ones as nodes, with arrows for dependencies (React Flow + dagre layout).

```sql
-- nodes = selected service + impacted services
-- edges = dependencies whose both ends are in that set
WITH nodes AS (
    SELECT $1::int AS id
    UNION
    SELECT impacted_id FROM get_impact($1) WHERE depth <= $2
)
SELECT d.service_id AS source, d.depends_on_service_id AS target, d.relationship_type
FROM service_dependencies d
WHERE d.service_id IN (SELECT id FROM nodes)
  AND d.depends_on_service_id IN (SELECT id FROM nodes);
```

**Concept.** Representing a graph in a relational table (an edge list), `UNION` to merge node sets, `CHECK (service_id <> depends_on_service_id)` to forbid self-loops, `UNIQUE(service_id, depends_on_service_id)` to forbid duplicate edges. "Expand next level" just re-runs this with `depth + 1`.

---

## 10. Impact Explorer — node details drawer

**What it does.** Click a node to see its owner, repository, dependents, recent commits, issues and ADRs.

```sql
-- header block
SELECT s.name, s.description, s.status, r.name AS repo, r.url, d.name AS owner,
       (SELECT count(*) FROM service_dependencies
          WHERE depends_on_service_id = s.service_id) AS dependents
FROM services s
JOIN repositories r ON r.repo_id = s.repo_id
JOIN developers  d ON d.developer_id = s.maintainer_id
WHERE s.service_id = $1;

-- recent commits
SELECT c.hash, c.message, c."timestamp", d.name AS author
FROM commits c
JOIN services   s ON s.repo_id = c.repo_id
JOIN developers d ON d.developer_id = c.author_id
WHERE s.service_id = $1
ORDER BY c."timestamp" DESC LIMIT 5;

-- linked ADRs
SELECT adr_id, title FROM adrs WHERE service_id = $1;
```

**Concept.** Multi-table JOINs across the foreign-key chain service → repository → commits → developer, and 1:N relationships.

---

## 11. Impact Explorer — results tabs (Affected APIs, Related issues, Related incidents, Tables)

**What it does.** Tables under the graph listing everything touched by the change.

```sql
-- Affected APIs
SELECT a.api_id, a.name, a.path, a.version, s.name AS service
FROM apis a
JOIN services s ON s.service_id = a.service_id
WHERE a.service_id = $1
   OR a.service_id IN (SELECT impacted_id FROM get_impact($1) WHERE depth <= $2)
ORDER BY s.name, a.path;

-- Related issues
SELECT i.issue_id, i.title, i.severity, i.status, s.name AS service
FROM issues i
JOIN services s ON s.service_id = i.service_id
WHERE i.status IN ('open','in_progress')
  AND i.service_id IN (SELECT impacted_id FROM get_impact($1) WHERE depth <= $2)
ORDER BY i.severity;

-- Affected tables
SELECT DISTINCT t.table_id, t.name, u.relationship_type
FROM service_table_usage u
JOIN database_tables t ON t.table_id = u.table_id
WHERE u.service_id IN (SELECT impacted_id FROM get_impact($1) WHERE depth <= $2);
```

**Concept.** Using a stored function as a subquery source, junction tables for many-to-many relationships (`service_api_usage`, `service_table_usage`), `DISTINCT`.

---

## 12. Services, APIs, Database Tables — list and detail pages

**What it does.** Browse, search and filter all components. Each has a detail page with tabs.

```sql
-- list (view)
SELECT * FROM v_service_overview ORDER BY service;
```
```sql
-- the view definition (advanced.sql)
CREATE VIEW v_service_overview AS
SELECT s.service_id, s.name AS service, s.status, r.name AS repo, d.name AS maintainer,
       (SELECT count(*) FROM issues i WHERE i.service_id = s.service_id
          AND i.status IN ('open','in_progress'))                    AS open_issues,
       (SELECT count(*) FROM incidents n WHERE n.service_id = s.service_id
          AND n.status <> 'resolved')                                AS open_incidents,
       (SELECT count(*) FROM service_dependencies x
          WHERE x.depends_on_service_id = s.service_id)              AS dependents,
       (SELECT count(*) FROM service_dependencies x
          WHERE x.service_id = s.service_id)                         AS dependencies
FROM services s
JOIN repositories r ON r.repo_id = s.repo_id
JOIN developers  d ON d.developer_id = s.maintainer_id;
```
```sql
-- APIs list and API consumers
SELECT a.api_id, a.name, a.path, a.version, a.status, s.name AS service
FROM apis a JOIN services s ON s.service_id = a.service_id ORDER BY s.name, a.path;

SELECT s.name AS consumer, u.relationship_type
FROM service_api_usage u JOIN services s ON s.service_id = u.service_id
WHERE u.api_id = $1;

-- Tables list and who uses each table
SELECT t.table_id, t.name, s.name AS owner_service,
       (SELECT count(*) FROM service_table_usage u WHERE u.table_id = t.table_id) AS used_by
FROM database_tables t JOIN services s ON s.service_id = t.service_id ORDER BY used_by DESC;

SELECT s.name, u.relationship_type FROM service_table_usage u
JOIN services s ON s.service_id = u.service_id WHERE u.table_id = $1;
```

**Concept.** **Views** (a saved query that hides joins and subqueries), `CHECK` constraints on `status`, M:N junction tables.

---

## 13. Service detail — Dependencies tab (incoming, outgoing, all levels)

**What it does.** Shows who depends on this service, what it depends on, and, new in the last update, everything it depends on at any depth.

```sql
-- incoming: who depends on me
SELECT s.name AS depends_on_me, x.relationship_type
FROM service_dependencies x
JOIN services s ON s.service_id = x.service_id
WHERE x.depends_on_service_id = $1;

-- outgoing: what I depend on directly
SELECT s.name AS i_depend_on, x.relationship_type
FROM service_dependencies x
JOIN services s ON s.service_id = x.depends_on_service_id
WHERE x.service_id = $1;

-- all levels (same logic as get_dependencies(), queries.sql Q9)
WITH RECURSIVE deps AS (
    SELECT service_id, depends_on_service_id, 1 AS depth
    FROM service_dependencies WHERE service_id = $1
    UNION
    SELECT d.service_id, d.depends_on_service_id, x.depth + 1
    FROM service_dependencies d
    JOIN deps x ON d.service_id = x.depends_on_service_id
)
SELECT s.name AS depends_on, min(x.depth) AS depth
FROM deps x JOIN services s ON s.service_id = x.depends_on_service_id
GROUP BY s.name ORDER BY depth, s.name;
```

**Concept.** The same self-referencing table read in both directions (incoming = reverse edge), and the recursive CTE in the opposite direction from section 7. `UNION` (not `UNION ALL`) removes repeats and also stops loops. The app wraps it in `get_dependencies()` ⚠.

---

## 14. Service detail — Commits, Issues, Incidents, ADRs, Owners tabs

**What it does.** The remaining tabs show the records linked to the service.

```sql
-- Commits tab: same query as the drawer, without LIMIT

-- Issues tab
SELECT i.issue_id, i.title, i.severity, i.status, i.created_date, d.name AS reporter
FROM issues i JOIN developers d ON d.developer_id = i.reporter_id
WHERE i.service_id = $1 ORDER BY i.created_date DESC;

-- Incidents tab
SELECT incident_id, title, severity, status, root_cause, resolution, created_date, resolved_date
FROM incidents WHERE service_id = $1 ORDER BY created_date DESC;

-- ADRs tab
SELECT a.adr_id, a.title, a.decision, a.context, d.name AS author, a.created_date
FROM adrs a JOIN developers d ON d.developer_id = a.author_id
WHERE a.service_id = $1 ORDER BY a.created_date DESC;

-- Owners tab (who actually works on it)
SELECT d.name, count(*) AS commits, max(c."timestamp") AS last_commit
FROM commits c
JOIN developers d ON d.developer_id = c.author_id
JOIN services   s ON s.repo_id = c.repo_id
WHERE s.service_id = $1
GROUP BY d.developer_id, d.name
ORDER BY commits DESC;
```

**Concept.** One-to-many relationships through foreign keys, `GROUP BY` with `count`/`max`. Each foreign-key column is indexed (`idx_issues_service`, `idx_adrs_service`, …).

---

## 15. Issues & Incidents — list, filters, search

**What it does.** A sortable, paginated table. You can filter by service, severity and status.

```sql
SELECT i.issue_id, i.title, i.severity, i.status, i.created_date,
       s.name AS service, d.name AS reporter
FROM issues i
JOIN services   s ON s.service_id   = i.service_id
JOIN developers d ON d.developer_id = i.reporter_id
WHERE ($1::int  IS NULL OR i.service_id = $1)
  AND ($2::text IS NULL OR i.severity   = $2)
  AND ($3::text IS NULL OR i.status     = $3)
ORDER BY i.created_date DESC
LIMIT $4 OFFSET $5;                         -- pagination
```

**Concept.** Dynamic filtering with optional parameters, pagination (`LIMIT/OFFSET`), and the composite index `idx_issues_status_severity` for the status+severity filter.

---

## 16. Issues — create, edit status, delete

**What it does.** Report a bug, move it through open → in_progress → resolved → closed, or delete it. Every change is recorded in the audit log automatically.

```sql
BEGIN;
-- tell the audit trigger who is acting (only for this transaction)
SELECT set_config('app.current_user_id', $1, true);

INSERT INTO issues (title, description, severity, service_id, reporter_id)
VALUES ($2, $3, $4, $5, $1)
RETURNING issue_id;

UPDATE issues SET status = $2 WHERE issue_id = $1;     -- trigger bumps updated_date + writes audit row
DELETE FROM issues WHERE issue_id = $1;                -- trigger writes a DELETE audit row
COMMIT;
```

Bad data is rejected by the database itself:

```sql
INSERT INTO issues (title, severity, service_id, reporter_id)
VALUES ('x', 'urgent', 1, 1);      -- ERROR: violates check constraint (severity)
```

**Concept.** **Transactions** (ACID), `SET LOCAL`/`set_config(..., true)` for transaction-scoped context, `RETURNING`, `CHECK` and `NOT NULL` constraints, and triggers firing automatically.

---

## 17. Incidents — resolve (stored procedure)

**What it does.** Closes an incident, with both root cause and resolution required. It refuses to resolve one that is already resolved.

```sql
CALL resolve_incident($1, $2, $3, $4);
-- (incident_id, root_cause, resolution, acting_user_id)
```

Inside the procedure:

```sql
PERFORM set_config('app.current_user_id', p_user_id::TEXT, true);

SELECT status INTO v_status FROM incidents WHERE incident_id = p_incident_id FOR UPDATE;  -- lock row

IF NOT FOUND                         THEN RAISE EXCEPTION 'Incident % not found', …;
IF v_status = 'resolved'             THEN RAISE EXCEPTION 'Incident % is already resolved', …;
IF blank(root_cause) OR blank(resolution) THEN RAISE EXCEPTION 'Root cause and resolution are both required';

UPDATE incidents
   SET status = 'resolved', root_cause = p_root_cause,
       resolution = p_resolution, resolved_date = now()
 WHERE incident_id = p_incident_id;
```

**Concept.** **Stored procedure** with validation, **row-level locking** (`SELECT … FOR UPDATE`) so two admins can't resolve the same incident at once, and atomicity: either every step happens or none does. The table also has `CHECK (resolved_date >= created_date)`.

---

## 18. Similar Incidents — semantic search (pgvector) ⚠

**What it does.** You paste a symptom. The app turns the text into a 384-number vector with a local model, then finds the incidents whose vectors are closest in meaning. It can also start from an existing incident and apply service/severity filters.

```sql
-- one-time setup (pgvector_setup.sql)
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS embedding vector(384);
CREATE INDEX IF NOT EXISTS idx_incidents_embedding
  ON incidents USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- search from typed text ($1 = the vector produced by the embedding model)
SELECT i.incident_id, i.title, i.severity, i.root_cause, i.resolution,
       s.name AS service,
       1 - (i.embedding <=> $1::vector) AS similarity
FROM incidents i
JOIN services s ON s.service_id = i.service_id
WHERE i.embedding IS NOT NULL
  AND ($2::int  IS NULL OR i.service_id = $2)
  AND ($3::text IS NULL OR i.severity   = $3)
ORDER BY i.embedding <=> $1::vector
LIMIT $4;

-- search starting from an existing incident ($5 = incident_id), excluding itself
SELECT i.incident_id, i.title, 1 - (i.embedding <=> src.embedding) AS similarity
FROM incidents i, (SELECT embedding FROM incidents WHERE incident_id = $5) src
WHERE i.incident_id <> $5 AND i.embedding IS NOT NULL
ORDER BY i.embedding <=> src.embedding
LIMIT $4;
```

**Concept.** **Vector database features inside PostgreSQL**: embeddings (unstructured meaning stored as numbers), distance operators (`<=>` cosine, `<->` L2, `<#>` inner product), an **approximate nearest-neighbour index (HNSW)**, and **hybrid queries** that combine vector ranking with relational filters and joins in one SQL statement. This is the "NoSQL / vector" part of the project. Check the index is used with `EXPLAIN` (`similar_incidents_demo.sql`, V5).

---

## 19. Similar Incidents — keyword fallback

**What it does.** Used automatically when pgvector or the model is unavailable. The page shows the reason.

```sql
SELECT incident_id, title,
       ts_rank(to_tsvector('english', title || ' ' || coalesce(description,'')),
               plainto_tsquery('english', $1)) AS rank
FROM incidents
WHERE to_tsvector('english', title || ' ' || coalesce(description,''))
      @@ plainto_tsquery('english', $1)
ORDER BY rank DESC
LIMIT $2;
```

**Concept.** **Full-text search** (tokenising, stemming, ranking). It finds matching words only, which is why the semantic search beats it on "signed out / clock skew".

---

## 20. Global search (Ctrl+K)

**What it does.** One box that searches services, APIs, issues, commits and ADRs together.

```sql
SELECT 'service' AS type, service_id AS id, name AS title
FROM services WHERE name ILIKE '%' || $1 || '%'
UNION ALL
SELECT 'api', api_id, name || ' ' || coalesce(path,'')
FROM apis WHERE name ILIKE '%' || $1 || '%' OR path ILIKE '%' || $1 || '%'
UNION ALL
SELECT 'issue', issue_id, title
FROM issues WHERE title ILIKE '%' || $1 || '%' OR description ILIKE '%' || $1 || '%'
UNION ALL
SELECT 'commit', commit_id, message
FROM commits WHERE message ILIKE '%' || $1 || '%'
UNION ALL
SELECT 'adr', adr_id, title
FROM adrs WHERE title ILIKE '%' || $1 || '%' OR decision ILIKE '%' || $1 || '%'
LIMIT 20;
```

**Concept.** `UNION ALL` to combine different tables into one result shape, pattern matching with `ILIKE`. An optional `pg_trgm` index (`migrations/001_optional_pg_trgm.sql`) speeds up `ILIKE '%…%'`.

---

## 21. Repositories, Developers, ADRs pages

**What it does.** Lists with counts and links between related records.

```sql
-- Repositories
SELECT r.repo_id, r.name, d.name AS owner,
       (SELECT count(*) FROM services s WHERE s.repo_id = r.repo_id) AS services,
       (SELECT count(*) FROM commits  c WHERE c.repo_id = r.repo_id) AS commits
FROM repositories r JOIN developers d ON d.developer_id = r.owner_id
ORDER BY r.name;

-- Developers
SELECT d.developer_id, d.name, d.auth_role,
       count(DISTINCT c.commit_id)  AS commits,
       count(DISTINCT s.service_id) AS services_maintained
FROM developers d
LEFT JOIN commits  c ON c.author_id     = d.developer_id
LEFT JOIN services s ON s.maintainer_id = d.developer_id
GROUP BY d.developer_id
ORDER BY commits DESC;

-- ADRs
SELECT a.adr_id, a.title, s.name AS service, d.name AS author, a.created_date
FROM adrs a
JOIN services   s ON s.service_id   = a.service_id
JOIN developers d ON d.developer_id = a.author_id
ORDER BY a.created_date DESC;
```

**Concept.** Multiple `LEFT JOIN`s with `COUNT(DISTINCT)` (to avoid inflated counts when joining two many-sides), `GROUP BY` on a primary key, and the referential rule `ON DELETE RESTRICT`, which stops you deleting a developer who has commits:

```sql
DELETE FROM developers WHERE developer_id = 1;
-- ERROR: violates foreign key constraint "commits_author_id_fkey"
```

---

## 22. Audit Log (Admin only)

**What it does.** Shows every change made through the app: who, what, old value, new value, when. You can filter by user, action, entity type and date.

```sql
SELECT a.log_id, d.name AS actor, a.action, a.entity_type, a.entity_id,
       a.old_value, a.new_value, a."timestamp"
FROM audit_logs a
JOIN developers d ON d.developer_id = a.performed_by
WHERE ($1::text IS NULL OR a.entity_type = $1)
  AND ($2::text IS NULL OR a.action      = $2)
  AND ($3::int  IS NULL OR a.performed_by = $3)
  AND a."timestamp" >= $4
ORDER BY a."timestamp" DESC
LIMIT $5 OFFSET $6;

-- search inside the JSON, e.g. all entries where a status became resolved
SELECT log_id, entity_type, entity_id, old_value, new_value
FROM audit_logs
WHERE new_value @> '{"status": "resolved"}';
```

How the rows get there (one trigger function shared by services, issues, incidents and ADRs):

```sql
CREATE TRIGGER trg_audit_issues
  AFTER INSERT OR UPDATE OR DELETE ON issues
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row('issue_id', 'issue');
-- the function stores only the changed fields, e.g. {"status": "in_progress"},
-- and strips password_hash and embedding so secrets never reach the log.
```

**Concept.** **Triggers** (AFTER row-level), **JSONB** (semi-structured data in a relational table), the `@>` containment operator, and a **GIN index** (`idx_audit_new_value_gin`) that makes JSONB search fast.

---

## 23. Automatic behaviour you will see but never click

| Behaviour | SQL object | Concept |
|---|---|---|
| `updated_date` refreshes when an issue changes | `BEFORE UPDATE` trigger `trg_issues_touch` | BEFORE trigger modifying `NEW` |
| Adding a circular dependency (A→B→C→A) is rejected | `BEFORE INSERT OR UPDATE` trigger `trg_no_dependency_cycle` using a recursive CTE | Integrity trigger |
| Deleting a service removes its APIs, tables, issues, incidents | `ON DELETE CASCADE` | Referential actions |
| Deleting a developer who has commits is blocked | `ON DELETE RESTRICT` | Referential integrity |
| A duplicate API path+version is rejected | `UNIQUE (path, version, service_id)` | UNIQUE constraint |
| Partial rollback inside a transaction | `SAVEPOINT` / `ROLLBACK TO` (queries.sql Q18) | Transactions |

---

## 24. Database-level roles (least privilege)

**What it does.** Separate from the app's login. Two Postgres roles limit what a connection can do, even if app code had a bug.

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_admin;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
REVOKE SELECT ON developers FROM app_readonly;
GRANT SELECT (developer_id, name, email, github_username, role, joined_date, auth_role, created_at)
  ON developers TO app_readonly;           -- column-level grant: no password_hash

SET ROLE app_readonly;
SELECT password_hash FROM developers;      -- ERROR: permission denied for table developers
```

**Concept.** **Authorization** with `GRANT`/`REVOKE`, role-based access, column-level privileges, and the principle of least privilege.

---

## 25. Indexes that make the above fast

```sql
-- graph traversal both directions
CREATE INDEX idx_svc_dep_from ON service_dependencies(service_id);
CREATE INDEX idx_svc_dep_to   ON service_dependencies(depends_on_service_id);

-- dashboard filters
CREATE INDEX idx_issues_status_severity    ON issues(status, severity);
CREATE INDEX idx_incidents_status_severity ON incidents(status, severity);

-- JSONB search
CREATE INDEX idx_audit_new_value_gin ON audit_logs USING GIN (new_value jsonb_path_ops);

-- vector search ⚠
CREATE INDEX idx_incidents_embedding ON incidents USING hnsw (embedding vector_cosine_ops);

-- prove an index is used
EXPLAIN SELECT * FROM service_dependencies WHERE depends_on_service_id = 3;
-- Bitmap Index Scan on idx_svc_dep_to
```

**Concept.** B-tree, GIN and HNSW indexes, and reading query plans with `EXPLAIN`.

---

## Normalisation note (if asked)

- **1NF:** every column holds a single value (JSONB is used only for the audit payload, on purpose).
- **2NF/3NF:** each fact lives in one table. Service owner is on `services`, not repeated on issues. Many-to-many links go in junction tables (`service_dependencies`, `service_api_usage`, `service_table_usage`) instead of comma lists.
- **Typed junction tables** (rather than one polymorphic table) keep real foreign keys, so the database can enforce integrity.
