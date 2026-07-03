-- migrate:skip - Supabase SQL-editor reference copy (targets the legacy
-- `trailhead_evaluations` table); NOT applied by the plain-pg runner
-- (cloud/scripts/migrate.ts), which manages the hosted contract schema.
-- Trailhead Cloud size-factor analytics columns (reference copy for hosted tier).
-- Komatik fleet store uses docs/komatik-migrations/20260703120000_trailhead_size_factor_analytics.sql

ALTER TABLE trailhead_evaluations
  ADD COLUMN IF NOT EXISTS size_score numeric,
  ADD COLUMN IF NOT EXISTS size_factors jsonb;

COMMENT ON COLUMN trailhead_evaluations.size_score IS
  'Structural blast-radius score from file_count/code_churn when reported separately.';
COMMENT ON COLUMN trailhead_evaluations.size_factors IS
  'Risk factor rows classified as structural size metadata.';
