-- ============================================================
-- 002 — server-side session revocation
-- Every session JWT carries a random jti. Logout stores the jti here until the
-- token would have expired anyway; the server rejects any token whose jti is listed.
-- Idempotent. Mirrored in schema.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti         TEXT PRIMARY KEY,
    expires_at  TIMESTAMPTZ NOT NULL
);

-- used by the opportunistic cleanup: DELETE ... WHERE expires_at < now()
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens (expires_at);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
        GRANT SELECT, INSERT, DELETE ON revoked_tokens TO app_admin;
    END IF;
END $$;
