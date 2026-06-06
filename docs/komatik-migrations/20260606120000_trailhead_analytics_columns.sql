-- Analytics columns for trailhead_evaluations (warehouse completeness audit Jun 2026)
-- Copy into Komatik/supabase/migrations/ via PR. Do NOT apply via MCP to prod.
--
-- Trailhead reference: cloud/migrations/004_analytics_columns.sql
-- Update platform/web/lib/trailhead/evaluation-store.ts mapEvaluationStoreRow to persist these fields.

ALTER TABLE public.trailhead_evaluations
  ADD COLUMN IF NOT EXISTS gate_mode text,
  ADD COLUMN IF NOT EXISTS submission_checks jsonb,
  ADD COLUMN IF NOT EXISTS policy_findings jsonb,
  ADD COLUMN IF NOT EXISTS release_ready_reasons jsonb,
  ADD COLUMN IF NOT EXISTS trust_profile jsonb,
  ADD COLUMN IF NOT EXISTS verdict jsonb,
  ADD COLUMN IF NOT EXISTS ci jsonb,
  ADD COLUMN IF NOT EXISTS context jsonb;

COMMENT ON COLUMN public.trailhead_evaluations.gate_mode IS
  'Gate mode at evaluation time: release-ready | advisory | risk-only.';
COMMENT ON COLUMN public.trailhead_evaluations.verdict IS
  'trailhead.verdict.v1 snapshot — agent trust collectors should read penalty from here.';
COMMENT ON COLUMN public.trailhead_evaluations.submission_checks IS
  'Gate 1 + Phase 0 submission check results when submission gate enabled.';
