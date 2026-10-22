-- migrate:skip — Supabase SQL-editor reference copy (targets the legacy
-- `trailhead_evaluations` table); NOT applied by the plain-pg runner
-- (cloud/scripts/migrate.ts), which manages the hosted contract schema.
-- ADR-011 Release Brief columns (reference copy for hosted tier).
-- Komatik fleet store uses docs/komatik-migrations/20260808120000_trailhead_release_brief.sql

ALTER TABLE trailhead_evaluations
  ADD COLUMN IF NOT EXISTS release_brief jsonb,
  ADD COLUMN IF NOT EXISTS enumerated_findings jsonb;

COMMENT ON COLUMN trailhead_evaluations.release_brief IS
  'ADR-011 Release Brief: verdict, risk + top movers, enumerated findings, per-input dispositions, delta, actions, override.';
COMMENT ON COLUMN trailhead_evaluations.enumerated_findings IS
  'ADR-011 §1: findings as {id,title,evidence,severity} rows. policy_findings keeps the legacy count strings.';
