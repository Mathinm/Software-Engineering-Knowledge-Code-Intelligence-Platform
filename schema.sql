-- ============================================================
-- Software Engineering Knowledge & Code Intelligence Platform
-- (ImpactGraph) — DBMS Level 3 Project
-- Full relational schema (DDL) — PostgreSQL
-- ============================================================

-- ---------- EXTENSIONS ----------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- for gen_random_uuid()

-- ============================================================
-- CORE ENTITY TABLES
-- ============================================================

CREATE TABLE developers (
    developer_id     SERIAL PRIMARY KEY,
    name              VARCHAR(100) NOT NULL,
    email             VARCHAR(150) NOT NULL UNIQUE,
    github_username   VARCHAR(100) UNIQUE,
    role              VARCHAR(50),
    joined_date       DATE DEFAULT CURRENT_DATE,
    password_hash     VARCHAR(255) NOT NULL,              -- bcrypt/argon2 hash, never plaintext
    auth_role         VARCHAR(20) NOT NULL DEFAULT 'developer'
                        CHECK (auth_role IN ('admin', 'developer')),
    created_at        TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE repositories (
    repo_id           SERIAL PRIMARY KEY,
    name              VARCHAR(150) NOT NULL,
    url               VARCHAR(255),
    description       TEXT,
    created_date      TIMESTAMP NOT NULL DEFAULT now(),
    owner_id          INTEGER NOT NULL
                        REFERENCES developers(developer_id)
                        ON DELETE RESTRICT,
    UNIQUE (name, owner_id)
);

CREATE TABLE commits (
    commit_id         SERIAL PRIMARY KEY,
    message           TEXT,
    "timestamp"       TIMESTAMP NOT NULL,
    hash              VARCHAR(64) NOT NULL UNIQUE,
    repo_id           INTEGER NOT NULL
                        REFERENCES repositories(repo_id)
                        ON DELETE CASCADE,
    author_id         INTEGER NOT NULL
                        REFERENCES developers(developer_id)
                        ON DELETE RESTRICT
);

CREATE TABLE services (
    service_id        SERIAL PRIMARY KEY,
    name              VARCHAR(150) NOT NULL,
    description       TEXT,
    status            VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'deprecated', 'maintenance')),
    created_date      TIMESTAMP NOT NULL DEFAULT now(),
    repo_id           INTEGER NOT NULL
                        REFERENCES repositories(repo_id)
                        ON DELETE CASCADE,
    maintainer_id     INTEGER NOT NULL
                        REFERENCES developers(developer_id)
                        ON DELETE RESTRICT,
    UNIQUE (name, repo_id)
);

CREATE TABLE apis (
    api_id            SERIAL PRIMARY KEY,
    name              VARCHAR(150) NOT NULL,
    path              VARCHAR(255),
    version           VARCHAR(20),
    status            VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'deprecated', 'beta')),
    service_id        INTEGER NOT NULL
                        REFERENCES services(service_id)
                        ON DELETE CASCADE,
    UNIQUE (path, version, service_id)
);

CREATE TABLE database_tables (
    table_id          SERIAL PRIMARY KEY,
    name              VARCHAR(150) NOT NULL,
    description       TEXT,
    service_id        INTEGER NOT NULL
                        REFERENCES services(service_id)
                        ON DELETE CASCADE,
    UNIQUE (name, service_id)
);

CREATE TABLE issues (
    issue_id          SERIAL PRIMARY KEY,
    title             VARCHAR(255) NOT NULL,
    description       TEXT,
    severity          VARCHAR(20) NOT NULL
                        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status            VARCHAR(20) NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_date      TIMESTAMP NOT NULL DEFAULT now(),
    updated_date      TIMESTAMP,
    service_id        INTEGER NOT NULL
                        REFERENCES services(service_id)
                        ON DELETE CASCADE,
    reporter_id       INTEGER NOT NULL
                        REFERENCES developers(developer_id)
                        ON DELETE RESTRICT
);

CREATE TABLE incidents (
    incident_id       SERIAL PRIMARY KEY,
    title             VARCHAR(255) NOT NULL,
    description       TEXT,
    severity          VARCHAR(20) NOT NULL
                        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status            VARCHAR(20) NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'investigating', 'resolved')),
    root_cause        TEXT,
    resolution        TEXT,
    created_date      TIMESTAMP NOT NULL DEFAULT now(),
    resolved_date     TIMESTAMP,
    service_id        INTEGER NOT NULL
                        REFERENCES services(service_id)
                        ON DELETE CASCADE,
    CHECK (resolved_date IS NULL OR resolved_date >= created_date)
);

CREATE TABLE adrs (
    adr_id            SERIAL PRIMARY KEY,
    title             VARCHAR(255) NOT NULL,
    decision          TEXT NOT NULL,
    context           TEXT,
    created_date      TIMESTAMP NOT NULL DEFAULT now(),
    service_id        INTEGER NOT NULL
                        REFERENCES services(service_id)
                        ON DELETE CASCADE,
    author_id         INTEGER NOT NULL
                        REFERENCES developers(developer_id)
                        ON DELETE RESTRICT
);

CREATE TABLE audit_logs (
    log_id            SERIAL PRIMARY KEY,
    action            VARCHAR(50) NOT NULL,
    entity_type       VARCHAR(50) NOT NULL,
    entity_id         INTEGER NOT NULL,
    old_value         JSONB,
    new_value         JSONB,
    "timestamp"       TIMESTAMP NOT NULL DEFAULT now(),
    performed_by      INTEGER NOT NULL
                        REFERENCES developers(developer_id)
                        ON DELETE RESTRICT
);

-- ============================================================
-- JUNCTION TABLES (M:N relationships — Option 2: typed, not polymorphic)
-- ============================================================

CREATE TABLE service_dependencies (
    dependency_id         SERIAL PRIMARY KEY,
    service_id            INTEGER NOT NULL
                            REFERENCES services(service_id)
                            ON DELETE CASCADE,
    depends_on_service_id INTEGER NOT NULL
                            REFERENCES services(service_id)
                            ON DELETE CASCADE,
    relationship_type     VARCHAR(50) NOT NULL DEFAULT 'runtime'
                            CHECK (relationship_type IN ('runtime', 'build_time', 'data')),
    created_date          TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (service_id, depends_on_service_id),
    CHECK (service_id <> depends_on_service_id)
);

CREATE TABLE service_api_usage (
    usage_id              SERIAL PRIMARY KEY,
    service_id            INTEGER NOT NULL
                            REFERENCES services(service_id)
                            ON DELETE CASCADE,
    api_id                INTEGER NOT NULL
                            REFERENCES apis(api_id)
                            ON DELETE CASCADE,
    relationship_type     VARCHAR(50) NOT NULL DEFAULT 'sync'
                            CHECK (relationship_type IN ('sync', 'async')),
    created_date          TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (service_id, api_id)
);

CREATE TABLE service_table_usage (
    usage_id              SERIAL PRIMARY KEY,
    service_id            INTEGER NOT NULL
                            REFERENCES services(service_id)
                            ON DELETE CASCADE,
    table_id              INTEGER NOT NULL
                            REFERENCES database_tables(table_id)
                            ON DELETE CASCADE,
    relationship_type     VARCHAR(50) NOT NULL DEFAULT 'read_write'
                            CHECK (relationship_type IN ('read_only', 'write_only', 'read_write')),
    created_date          TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (service_id, table_id)
);

-- ============================================================
-- SESSION REVOCATION (also migrations/002_session_revocation.sql)
-- Logout stores the session JWT's jti until it would expire; listed tokens are rejected.
-- ============================================================

CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti               TEXT PRIMARY KEY,
    expires_at        TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);

-- ============================================================
-- INDEXES (beyond the ones auto-created for PK/UNIQUE)
-- ============================================================

-- FK lookups that will be hit constantly by the API layer
CREATE INDEX idx_repositories_owner        ON repositories(owner_id);
CREATE INDEX idx_commits_repo              ON commits(repo_id);
CREATE INDEX idx_commits_author            ON commits(author_id);
CREATE INDEX idx_services_repo             ON services(repo_id);
CREATE INDEX idx_services_maintainer       ON services(maintainer_id);
CREATE INDEX idx_apis_service              ON apis(service_id);
CREATE INDEX idx_database_tables_service   ON database_tables(service_id);
CREATE INDEX idx_issues_service            ON issues(service_id);
CREATE INDEX idx_issues_reporter           ON issues(reporter_id);
CREATE INDEX idx_incidents_service         ON incidents(service_id);
CREATE INDEX idx_adrs_service              ON adrs(service_id);
CREATE INDEX idx_adrs_author               ON adrs(author_id);
CREATE INDEX idx_audit_logs_performed_by   ON audit_logs(performed_by);
CREATE INDEX idx_audit_logs_entity         ON audit_logs(entity_type, entity_id);

-- junction-table lookups (traverse the dependency graph both directions)
CREATE INDEX idx_svc_dep_from              ON service_dependencies(service_id);
CREATE INDEX idx_svc_dep_to                ON service_dependencies(depends_on_service_id);
CREATE INDEX idx_svc_api_service           ON service_api_usage(service_id);
CREATE INDEX idx_svc_api_api               ON service_api_usage(api_id);
CREATE INDEX idx_svc_table_service         ON service_table_usage(service_id);
CREATE INDEX idx_svc_table_table           ON service_table_usage(table_id);

-- filtering/sorting columns used often in dashboards
CREATE INDEX idx_issues_status_severity    ON issues(status, severity);
CREATE INDEX idx_incidents_status_severity ON incidents(status, severity);
