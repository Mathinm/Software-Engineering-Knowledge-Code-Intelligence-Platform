-- OPTIONAL. Not required by the app; not applied automatically.
-- Enables typo-tolerant trigram similarity in Similar Incidents.
-- The app detects pg_trgm at runtime and blends it into the full-text score (70/30).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
