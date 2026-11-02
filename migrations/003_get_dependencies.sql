-- ============================================================
-- 003 — get_dependencies(service_id): everything a service depends on,
-- directly or indirectly (the opposite direction of get_impact).
-- Same logic as queries.sql Q9, packaged like get_impact: depth + path + cycle guard.
-- Idempotent (CREATE OR REPLACE). Mirrored in advanced.sql section 3b.
-- ============================================================

CREATE OR REPLACE FUNCTION get_dependencies(p_service_id INT)
RETURNS TABLE (dependency_service_id INT, dependency_service VARCHAR, depth INT, path TEXT) AS $$
    WITH RECURSIVE deps AS (
        SELECT d.depends_on_service_id AS sid,
               1                       AS lvl,
               ARRAY[d.service_id, d.depends_on_service_id] AS trail
          FROM service_dependencies d
         WHERE d.service_id = p_service_id
        UNION ALL
        SELECT d.depends_on_service_id,
               x.lvl + 1,
               x.trail || d.depends_on_service_id
          FROM service_dependencies d
          JOIN deps x ON d.service_id = x.sid
         WHERE d.depends_on_service_id <> ALL (x.trail)   -- cycle guard
    ),
    nearest AS (
        SELECT DISTINCT ON (sid) sid, lvl, trail
          FROM deps
         ORDER BY sid, lvl
    )
    SELECT n.sid,
           s.name,
           n.lvl,
           (SELECT string_agg(x.name, ' -> ' ORDER BY t.ord)
              FROM unnest(n.trail) WITH ORDINALITY AS t(id, ord)
              JOIN services x ON x.service_id = t.id)
      FROM nearest n
      JOIN services s ON s.service_id = n.sid
     ORDER BY n.lvl, s.name;
$$ LANGUAGE sql STABLE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
        GRANT EXECUTE ON FUNCTION get_dependencies(INT) TO app_admin;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_readonly') THEN
        GRANT EXECUTE ON FUNCTION get_dependencies(INT) TO app_readonly;
    END IF;
END $$;
