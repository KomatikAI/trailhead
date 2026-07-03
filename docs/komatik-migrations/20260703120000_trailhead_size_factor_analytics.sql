-- Size-factor analytics columns for trailhead_evaluations (risk-score polish Jul 2026)
-- Copy into Komatik/supabase/migrations/ via PR. Do NOT apply via MCP to prod.
--
-- Trailhead reference: cloud/migrations/005_size_factor_analytics.sql
-- Update platform/web/lib/trailhead/evaluation-store.ts mapEvaluationStoreRow to persist these fields.

ALTER TABLE public.trailhead_evaluations
  ADD COLUMN IF NOT EXISTS size_score numeric,
  ADD COLUMN IF NOT EXISTS size_factors jsonb;

COMMENT ON COLUMN public.trailhead_evaluations.size_score IS
  'Structural blast-radius score from file_count/code_churn when reported separately.';
COMMENT ON COLUMN public.trailhead_evaluations.size_factors IS
  'Risk factor rows classified as structural size metadata.';
