-- ADR-011 Release Brief columns for trailhead_evaluations (Aug 2026)
-- Copy into Komatik/supabase/migrations/ via PR. Do NOT apply via MCP to prod.
--
-- Trailhead reference: cloud/migrations/006_release_brief.sql
-- Update platform/web/lib/trailhead/evaluation-store.ts mapEvaluationStoreRow to persist these fields:
--   release_brief:        pick(body, "releaseBrief", "release_brief") ?? null,
--   enumerated_findings:  pick(body, "enumeratedFindings", "enumerated_findings") ?? null,
--
-- Until this lands, Trailhead degrades gracefully: the direct-Supabase store path
-- retries the insert without these two columns, and the delta lookup falls back to
-- its pre-ADR-011 narrow select.

ALTER TABLE public.trailhead_evaluations
  ADD COLUMN IF NOT EXISTS release_brief jsonb,
  ADD COLUMN IF NOT EXISTS enumerated_findings jsonb;

COMMENT ON COLUMN public.trailhead_evaluations.release_brief IS
  'ADR-011 Release Brief: verdict, risk + top movers, enumerated findings, per-input dispositions, delta, actions, override.';
COMMENT ON COLUMN public.trailhead_evaluations.enumerated_findings IS
  'ADR-011 §1: findings as {id,title,evidence,severity} rows. policy_findings keeps the legacy count strings.';
