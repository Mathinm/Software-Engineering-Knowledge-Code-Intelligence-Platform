-- ============================================================
-- ImpactGraph — demonstration queries
-- Run AFTER schema.sql, seed.sql, advanced.sql.
-- Each block is labelled with the rubric item it demonstrates.
-- ============================================================

\echo '--- Q1  JOIN (4 tables): open issues with service, repo and reporter'
SELECT i.issue_id, i.title, i.severity, s.name AS service, r.name AS repo, d.name AS reporter
FROM issues i
JOIN services     s ON s.service_id   = i.service_id
JOIN repositories r ON r.repo_id      = s.repo_id
JOIN developers   d ON d.developer_id = i.reporter_id
WHERE i.status IN ('open', 'in_progress')
ORDER BY i.severity, i.issue_id;

\echo '--- Q2  GROUP BY + HAVING: services with more than one open/in-progress issue'
SELECT s.name AS service, count(*) AS open_issues
FROM issues i
JOIN services s ON s.service_id = i.service_id
WHERE i.status IN ('open', 'in_progress')
GROUP BY s.name
HAVING count(*) > 1
ORDER BY open_issues DESC;

\echo '--- Q3  Aggregates: mean time to resolve incidents, by severity'
SELECT severity,
       count(*)                                    AS resolved_incidents,
       round(avg(EXTRACT(EPOCH FROM (resolved_date - created_date)) / 3600)::numeric, 1) AS avg_hours,
       max(resolved_date - created_date)           AS longest
FROM incidents
WHERE status = 'resolved'
GROUP BY severity
ORDER BY avg_hours DESC;

\echo '--- Q4  Subquery: services with more open issues than the average service'
SELECT service, open_issues
FROM v_service_overview
WHERE open_issues > (SELECT avg(open_issues) FROM v_service_overview)
ORDER BY open_issues DESC;

\echo '--- Q5  Correlated subquery: developers who committed to repos they do not own'
SELECT d.name
FROM developers d
WHERE EXISTS (
    SELECT 1
    FROM commits c
    JOIN repositories r ON r.repo_id = c.repo_id
    WHERE c.author_id = d.developer_id
      AND r.owner_id <> d.developer_id
)
ORDER BY d.name;

\echo '--- Q6  Window function: rank services by risk (open issues + open incidents)'
SELECT service,
       open_issues,
       open_incidents,
       dependents,
       RANK() OVER (ORDER BY open_issues + open_incidents DESC, dependents DESC) AS risk_rank
FROM v_service_overview
ORDER BY risk_rank, service;

\echo '--- Q7  Window function: cumulative incidents per month'
SELECT to_char(date_trunc('month', created_date), 'YYYY-MM') AS month,
       count(*)                                              AS incidents,
       sum(count(*)) OVER (ORDER BY date_trunc('month', created_date)) AS cumulative
FROM incidents
GROUP BY date_trunc('month', created_date)
ORDER BY 1;

\echo '--- Q8  Recursive CTE (stored function): what breaks if auth-service goes down?'
SELECT * FROM get_impact(3);

\echo '--- Q9  Recursive CTE: what does order-service depend on, directly or indirectly?'
WITH RECURSIVE deps AS (
    SELECT service_id, depends_on_service_id, 1 AS depth
    FROM service_dependencies
    WHERE service_id = 5
    UNION
    SELECT d.service_id, d.depends_on_service_id, x.depth + 1
    FROM service_dependencies d
    JOIN deps x ON d.service_id = x.depends_on_service_id
)
SELECT s.name AS depends_on, min(x.depth) AS depth
FROM deps x
JOIN services s ON s.service_id = x.depends_on_service_id
GROUP BY s.name
ORDER BY depth, s.name;

\echo '--- Q10 View: service overview'
SELECT * FROM v_service_overview ORDER BY service_id;

\echo '--- Q11 View: priority issues'
SELECT * FROM v_priority_issues ORDER BY created_date;

\echo '--- Q12 JSONB search: audit entries where a status changed to resolved'
SELECT log_id, entity_type, entity_id, old_value, new_value
FROM audit_logs
WHERE new_value @> '{"status": "resolved"}'
ORDER BY log_id;

-- ------------------------------------------------------------
-- Trigger, procedure, transaction and constraint demos
-- (they change data; each runs inside a transaction that is rolled back,
--  so you can re-run this file without changing your seed data)
-- ------------------------------------------------------------

\echo '--- Q13 Trigger demo: updating an issue writes to audit_logs and bumps updated_date'
BEGIN;
SELECT set_config('app.current_user_id', '3', true);          -- act as Rohan
UPDATE issues SET status = 'in_progress' WHERE issue_id = 4;
SELECT issue_id, status, updated_date FROM issues WHERE issue_id = 4;
SELECT action, entity_type, entity_id, old_value, new_value, performed_by
FROM audit_logs ORDER BY log_id DESC LIMIT 1;
ROLLBACK;

\echo '--- Q14 Stored procedure demo: resolve incident 6 (in a rolled-back transaction)'
BEGIN;
CALL resolve_incident(6, 'Race condition in concurrent reservations',
                         'Optimistic locking on stock rows', 5);
SELECT incident_id, status, root_cause, resolved_date IS NOT NULL AS has_resolved_date
FROM incidents WHERE incident_id = 6;
ROLLBACK;

\echo '--- Q15 Procedure validation: resolving an already-resolved incident fails cleanly'
DO $$
BEGIN
    CALL resolve_incident(1, 'x', 'y', 1);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Rejected as expected: %', SQLERRM;
END $$;

\echo '--- Q16 Integrity trigger: a circular dependency is rejected'
DO $$
BEGIN
    -- auth-service (3) already sits below payment-service (1); making 3 depend on 1 closes a loop
    INSERT INTO service_dependencies (service_id, depends_on_service_id, relationship_type)
    VALUES (3, 1, 'runtime');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Rejected as expected: %', SQLERRM;
END $$;

\echo '--- Q17 CHECK / UNIQUE constraints: bad data is rejected'
DO $$
BEGIN
    INSERT INTO issues (title, severity, service_id, reporter_id)
    VALUES ('bad severity', 'urgent', 1, 1);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Rejected as expected: %', SQLERRM;
END $$;

\echo '--- Q18 Transaction with SAVEPOINT: partial rollback'
BEGIN;
UPDATE services SET status = 'maintenance' WHERE service_id = 1;
SAVEPOINT after_first;
UPDATE services SET status = 'deprecated' WHERE service_id = 2;
ROLLBACK TO SAVEPOINT after_first;                              -- undo only the second update
SELECT service_id, name, status FROM services WHERE service_id IN (1, 2) ORDER BY service_id;
ROLLBACK;                                                       -- undo everything
