-- ============================================================
-- ImpactGraph — advanced database objects
-- Run AFTER schema.sql and seed.sql.
-- Contains: views, triggers, stored function (recursive CTE),
-- stored procedure (transaction), JSONB index, DB-level roles.
-- ============================================================

-- ------------------------------------------------------------
-- 1. VIEWS
-- ------------------------------------------------------------

-- One row per service with ownership, load and dependency counts
CREATE OR REPLACE VIEW v_service_overview AS
SELECT s.service_id,
       s.name                        AS service,
       s.status,
       r.name                        AS repo,
       d.name                        AS maintainer,
       (SELECT count(*) FROM issues i
         WHERE i.service_id = s.service_id
           AND i.status IN ('open', 'in_progress'))      AS open_issues,
       (SELECT count(*) FROM incidents n
         WHERE n.service_id = s.service_id
           AND n.status <> 'resolved')                   AS open_incidents,
       (SELECT count(*) FROM service_dependencies x
         WHERE x.depends_on_service_id = s.service_id)   AS dependents,
       (SELECT count(*) FROM service_dependencies x
         WHERE x.service_id = s.service_id)              AS dependencies
FROM services s
JOIN repositories r ON r.repo_id = s.repo_id
JOIN developers  d ON d.developer_id = s.maintainer_id;

-- High-priority work still unresolved
CREATE OR REPLACE VIEW v_priority_issues AS
SELECT i.issue_id, i.title, i.severity, i.status, i.created_date,
       s.name AS service, d.name AS reporter
FROM issues i
JOIN services   s ON s.service_id   = i.service_id
JOIN developers d ON d.developer_id = i.reporter_id
WHERE i.severity IN ('high', 'critical')
  AND i.status NOT IN ('resolved', 'closed');

-- ------------------------------------------------------------
-- 2. TRIGGERS
-- ------------------------------------------------------------

-- 2a. Generic audit trigger: logs INSERT / UPDATE / DELETE into audit_logs.
--     The API sets who is acting with:  SET LOCAL app.current_user_id = '<id>';
--     If it is not set, the action is attributed to developer 1 (admin).
--     Args: TG_ARGV[0] = primary key column, TG_ARGV[1] = entity type label.
CREATE OR REPLACE FUNCTION fn_audit_row() RETURNS trigger AS $$
DECLARE
    v_user   INT;
    v_old    JSONB;
    v_new    JSONB;
    v_pk     INT;
    v_oldch  JSONB;
    v_newch  JSONB;
BEGIN
    v_user := COALESCE(NULLIF(current_setting('app.current_user_id', true), '')::INT, 1);

    IF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW) - 'embedding' - 'password_hash';
        v_pk  := (v_new ->> TG_ARGV[0])::INT;
        INSERT INTO audit_logs (action, entity_type, entity_id, old_value, new_value, performed_by)
        VALUES ('CREATE', TG_ARGV[1], v_pk, NULL, v_new, v_user);

    ELSIF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD) - 'embedding' - 'password_hash';
        v_new := to_jsonb(NEW) - 'embedding' - 'password_hash';
        IF v_old IS DISTINCT FROM v_new THEN
            -- store only the fields that actually changed
            SELECT jsonb_object_agg(key, value)
              INTO v_newch FROM jsonb_each(v_new)
             WHERE v_old -> key IS DISTINCT FROM value;
            SELECT jsonb_object_agg(key, v_old -> key)
              INTO v_oldch FROM jsonb_each(v_new)
             WHERE v_old -> key IS DISTINCT FROM value;
            v_pk := (v_new ->> TG_ARGV[0])::INT;
            INSERT INTO audit_logs (action, entity_type, entity_id, old_value, new_value, performed_by)
            VALUES ('UPDATE', TG_ARGV[1], v_pk, v_oldch, v_newch, v_user);
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD) - 'embedding' - 'password_hash';
        v_pk  := (v_old ->> TG_ARGV[0])::INT;
        INSERT INTO audit_logs (action, entity_type, entity_id, old_value, new_value, performed_by)
        VALUES ('DELETE', TG_ARGV[1], v_pk, v_old, NULL, v_user);
    END IF;

    RETURN NULL;   -- AFTER trigger: return value is ignored
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_services
    AFTER INSERT OR UPDATE OR DELETE ON services
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('service_id', 'service');
CREATE TRIGGER trg_audit_issues
    AFTER INSERT OR UPDATE OR DELETE ON issues
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('issue_id', 'issue');
CREATE TRIGGER trg_audit_incidents
    AFTER INSERT OR UPDATE OR DELETE ON incidents
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('incident_id', 'incident');
CREATE TRIGGER trg_audit_adrs
    AFTER INSERT OR UPDATE OR DELETE ON adrs
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('adr_id', 'adr');

-- 2b. Keep issues.updated_date current automatically
CREATE OR REPLACE FUNCTION fn_touch_updated() RETURNS trigger AS $$
BEGIN
    NEW.updated_date := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_issues_touch
    BEFORE UPDATE ON issues
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- 2c. Integrity: reject a dependency that would create a cycle
--     (A -> B -> C -> A). Walks everything NEW.depends_on already reaches.
CREATE OR REPLACE FUNCTION fn_prevent_dependency_cycle() RETURNS trigger AS $$
BEGIN
    IF EXISTS (
        WITH RECURSIVE reach AS (
            SELECT depends_on_service_id AS id
              FROM service_dependencies
             WHERE service_id = NEW.depends_on_service_id
            UNION
            SELECT d.depends_on_service_id
              FROM service_dependencies d
              JOIN reach r ON d.service_id = r.id
        )
        SELECT 1 FROM reach WHERE id = NEW.service_id
    ) THEN
        RAISE EXCEPTION 'Circular dependency: service % already depends (directly or indirectly) on service %',
            NEW.depends_on_service_id, NEW.service_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_no_dependency_cycle
    BEFORE INSERT OR UPDATE ON service_dependencies
    FOR EACH ROW EXECUTE FUNCTION fn_prevent_dependency_cycle();

-- ------------------------------------------------------------
-- 3. STORED FUNCTION — blast radius via recursive CTE
--    get_impact(X) = every service that breaks if X goes down,
--    with distance and the dependency path that links them.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_impact(p_service_id INT)
RETURNS TABLE (impacted_id INT, impacted_service VARCHAR, depth INT, path TEXT) AS $$
    WITH RECURSIVE impact AS (
        SELECT d.service_id AS sid,
               1            AS lvl,
               ARRAY[d.depends_on_service_id, d.service_id] AS trail
          FROM service_dependencies d
         WHERE d.depends_on_service_id = p_service_id
        UNION ALL
        SELECT d.service_id,
               i.lvl + 1,
               i.trail || d.service_id
          FROM service_dependencies d
          JOIN impact i ON d.depends_on_service_id = i.sid
         WHERE d.service_id <> ALL (i.trail)          -- cycle guard
    ),
    nearest AS (
        SELECT DISTINCT ON (sid) sid, lvl, trail
          FROM impact
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

-- ------------------------------------------------------------
-- 3b. STORED FUNCTION — what a service depends on (all levels)
--     get_dependencies(X) = every service X needs, directly or indirectly,
--     with distance and path. Opposite direction of get_impact (also migrations/003).
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. STORED PROCEDURE — resolve an incident (validated, transactional)
--    CALL resolve_incident(<incident_id>, '<root cause>', '<resolution>', <user_id>);
-- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE resolve_incident(
    p_incident_id INT,
    p_root_cause  TEXT,
    p_resolution  TEXT,
    p_user_id     INT
) LANGUAGE plpgsql AS $$
DECLARE
    v_status TEXT;
BEGIN
    -- tell the audit trigger who is acting (transaction-local)
    PERFORM set_config('app.current_user_id', p_user_id::TEXT, true);

    SELECT status INTO v_status
      FROM incidents
     WHERE incident_id = p_incident_id
       FOR UPDATE;                                   -- lock the row

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Incident % not found', p_incident_id;
    END IF;
    IF v_status = 'resolved' THEN
        RAISE EXCEPTION 'Incident % is already resolved', p_incident_id;
    END IF;
    IF COALESCE(trim(p_root_cause), '') = '' OR COALESCE(trim(p_resolution), '') = '' THEN
        RAISE EXCEPTION 'Root cause and resolution are both required';
    END IF;

    UPDATE incidents
       SET status        = 'resolved',
           root_cause    = p_root_cause,
           resolution    = p_resolution,
           resolved_date = now()
     WHERE incident_id = p_incident_id;
END;
$$;

-- ------------------------------------------------------------
-- 5. JSONB (document-style storage) — fast search inside audit payloads
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_new_value_gin
    ON audit_logs USING GIN (new_value jsonb_path_ops);

-- ------------------------------------------------------------
-- 6. DATABASE-LEVEL ROLES (least privilege)
-- ------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
        CREATE ROLE app_admin NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_readonly') THEN
        CREATE ROLE app_readonly NOLOGIN;
    END IF;
END $$;

-- admin: full access to application data
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_admin;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_admin;
GRANT EXECUTE ON FUNCTION get_impact(INT)                           TO app_admin;
GRANT EXECUTE ON FUNCTION get_dependencies(INT)                     TO app_admin;
GRANT EXECUTE ON PROCEDURE resolve_incident(INT, TEXT, TEXT, INT)   TO app_admin;

-- read-only: can read everything except credential hashes
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
REVOKE SELECT ON developers FROM app_readonly;
GRANT SELECT (developer_id, name, email, github_username, role, joined_date, auth_role, created_at)
    ON developers TO app_readonly;
GRANT EXECUTE ON FUNCTION get_impact(INT) TO app_readonly;
GRANT EXECUTE ON FUNCTION get_dependencies(INT) TO app_readonly;
