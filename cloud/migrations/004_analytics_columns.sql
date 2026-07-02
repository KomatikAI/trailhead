-- migrate:skip — Supabase SQL-editor reference copy (targets the legacy
-- `trailhead_evaluations` table); NOT applied by the plain-pg runner
-- (cloud/scripts/migrate.ts), which manages the hosted contract schema.
-- Trailhead Cloud analytics columns (reference copy for hosted tier).
-- Komatik fleet store uses docs/komatik-migrations/20260606120000_trailhead_analytics_columns.sql

ALTER TABLE trailhead_evaluations
  ADD COLUMN IF NOT EXISTS gate_mode text,
  ADD COLUMN IF NOT EXISTS submission_checks jsonb,
  ADD COLUMN IF NOT EXISTS policy_findings jsonb,
  ADD COLUMN IF NOT EXISTS release_ready_reasons jsonb,
  ADD COLUMN IF NOT EXISTS trust_profile jsonb,
  ADD COLUMN IF NOT EXISTS verdict jsonb,
  ADD COLUMN IF NOT EXISTS ci jsonb,
  ADD COLUMN IF NOT EXISTS context jsonb;
