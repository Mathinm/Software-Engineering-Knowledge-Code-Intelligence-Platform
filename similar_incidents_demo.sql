-- ============================================================
-- ImpactGraph — vector search demo (pgvector)
-- Run against the Docker database (port 5433) AFTER pgvector_setup.sql,
-- seed_incidents_extra.sql and `npm run embed`:
--   docker compose --env-file .env.local -f docker-compose.pgvector.yml exec -T db \
--     psql -U postgres -d impactgraph -f /sql/similar_incidents_demo.sql
-- Read-only: nothing here changes data.
-- ============================================================

\echo '--- V1  Nearest neighbours: top 3 incidents most similar to INC-1 (cosine distance <=>)'
SELECT n.incident_id, n.title, s.name AS service,
       round((1 - (n.embedding <=> src.embedding))::numeric, 3) AS cosine_similarity
FROM incidents n
JOIN services s ON s.service_id = n.service_id,
     (SELECT embedding FROM incidents WHERE incident_id = 1) src
WHERE n.incident_id <> 1
ORDER BY n.embedding <=> src.embedding
LIMIT 3;

\echo '--- V2  Hybrid relational + vector: same search, only services in the payments-platform repository'
SELECT n.incident_id, n.title, s.name AS service, r.name AS repo,
       round((1 - (n.embedding <=> src.embedding))::numeric, 3) AS cosine_similarity
FROM incidents n
JOIN services s     ON s.service_id = n.service_id
JOIN repositories r ON r.repo_id = s.repo_id,
     (SELECT embedding FROM incidents WHERE incident_id = 1) src
WHERE n.incident_id <> 1
  AND r.name = 'payments-platform'          -- ordinary relational filter
ORDER BY n.embedding <=> src.embedding      -- vector ranking
LIMIT 3;

\echo '--- V3  Similarity threshold: every pair of incidents at least 0.60 similar (likely the same kind of failure)'
SELECT a.incident_id AS a, b.incident_id AS b, left(a.title, 40) AS a_title, left(b.title, 40) AS b_title,
       round((1 - (a.embedding <=> b.embedding))::numeric, 3) AS cosine_similarity
FROM incidents a
JOIN incidents b ON a.incident_id < b.incident_id
WHERE 1 - (a.embedding <=> b.embedding) >= 0.60
ORDER BY cosine_similarity DESC;

\echo '--- V4  The three distance operators on the same pair (INC-1 vs INC-11)'
-- <->  Euclidean (L2) distance        smaller = closer
-- <=>  cosine distance (1 - cosine)   smaller = closer   (what the app uses)
-- <#>  NEGATIVE inner product         smaller = closer
-- Our vectors are L2-normalised (length 1), so: cosine distance = 1 - dot product,
-- and L2 distance = sqrt(2 * cosine distance). All three give the same ranking here.
SELECT round((a.embedding <-> b.embedding)::numeric, 4)              AS l2_distance,
       round((a.embedding <=> b.embedding)::numeric, 4)              AS cosine_distance,
       round((a.embedding <#> b.embedding)::numeric, 4)              AS negative_inner_product,
       round(sqrt(2 * (a.embedding <=> b.embedding))::numeric, 4)    AS l2_from_cosine_check,
       round(vector_norm(a.embedding)::numeric, 4)                   AS norm_a
FROM incidents a, incidents b
WHERE a.incident_id = 1 AND b.incident_id = 11;

\echo '--- V5  EXPLAIN: the HNSW index answers the nearest-neighbour query'
-- With only ~30 rows the planner would normally choose a sequential scan (cheaper on a tiny table).
-- For the demo we switch seq scans off in THIS transaction only, to show the index is usable.
BEGIN;
SET LOCAL enable_seqscan = off;
EXPLAIN (COSTS OFF)
SELECT incident_id, title
FROM incidents
ORDER BY embedding <=> (SELECT embedding FROM incidents WHERE incident_id = 1)
LIMIT 3;
ROLLBACK;

\echo '--- V6  Aggregate over similarity: average similarity between incidents of each pair of services (top 6)'
SELECT sa.name AS service_a, sb.name AS service_b,
       count(*) AS incident_pairs,
       round(avg(1 - (a.embedding <=> b.embedding))::numeric, 3) AS avg_similarity,
       round(max(1 - (a.embedding <=> b.embedding))::numeric, 3) AS max_similarity
FROM incidents a
JOIN incidents b ON a.incident_id < b.incident_id
JOIN services sa ON sa.service_id = a.service_id
JOIN services sb ON sb.service_id = b.service_id
GROUP BY sa.name, sb.name
HAVING count(*) >= 2
ORDER BY avg_similarity DESC
LIMIT 6;

\echo '--- V7  Aggregate per severity: how close is each incident to its nearest neighbour?'
SELECT a.severity,
       count(*) AS incidents,
       round(avg(nn.sim)::numeric, 3) AS avg_nearest_similarity
FROM incidents a
CROSS JOIN LATERAL (
    SELECT 1 - (b.embedding <=> a.embedding) AS sim
    FROM incidents b
    WHERE b.incident_id <> a.incident_id
    ORDER BY b.embedding <=> a.embedding
    LIMIT 1
) nn
GROUP BY a.severity
ORDER BY avg_nearest_similarity DESC;
