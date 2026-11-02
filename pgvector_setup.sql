-- ============================================================
-- ImpactGraph — vector search layer (pgvector)
-- Run AFTER schema.sql, seed.sql, advanced.sql. Safe to run more than once.
--
-- incidents.embedding holds a 384-dimensional sentence embedding of
-- title + description + root_cause + resolution, produced by the local model
-- Xenova/all-MiniLM-L6-v2 (mean pooling, L2-normalised) — see lib/embeddings.ts
-- and scripts/embed-incidents.mjs. Rows start NULL until `npm run embed`.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS embedding vector(384);

-- Approximate nearest-neighbour index for cosine distance (<=>).
-- HNSW instead of ivfflat: ivfflat needs training data (lists) and recalls
-- poorly on a table this small; HNSW works well from the first row.
CREATE INDEX IF NOT EXISTS idx_incidents_embedding_hnsw
    ON incidents USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Note: fn_audit_row() (advanced.sql) already does  to_jsonb(NEW) - 'embedding',
-- so vectors are never copied into audit_logs.
