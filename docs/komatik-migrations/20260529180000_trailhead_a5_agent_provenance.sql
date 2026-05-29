-- A5 tuning digest — Komatik hosted store (trailhead_evaluations)
-- Copy into Komatik/supabase/migrations/ via PR. Do NOT apply via MCP to prod.
--
-- Trailhead reference: cloud/migrations/003_tuning_digest_a5.sql
-- Runbook: docs/runbooks/KOMATIK-A5-STORE-MIGRATION.md

ALTER TABLE public.trailhead_evaluations
  ADD COLUMN IF NOT EXISTS agent_provenance_id text;

CREATE INDEX IF NOT EXISTS idx_trailhead_evals_agent_provenance
  ON public.trailhead_evaluations (agent_provenance_id, created_at DESC)
  WHERE agent_provenance_id IS NOT NULL;

COMMENT ON COLUMN public.trailhead_evaluations.agent_provenance_id IS
  'Denormalised pr.provenance.source for agent group-by (Trailhead A5).';

-- Best-effort backfill from pr JSONB
UPDATE public.trailhead_evaluations
SET agent_provenance_id = COALESCE(
  pr->'provenance'->>'source',
  substring(pr->>'headRef' from '^agent/([^/]+)/')
)
WHERE agent_provenance_id IS NULL
  AND pr IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.trailhead_detector_downgrades (
  detector_code text PRIMARY KEY,
  downgraded_at timestamptz NOT NULL DEFAULT now(),
  fp_rate_at_trigger numeric NOT NULL,
  tuning_issue_url text,
  reverted_at timestamptz,
  reverted_by text
);

ALTER TABLE public.trailhead_detector_downgrades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON public.trailhead_detector_downgrades
  FOR ALL TO service_role USING (true) WITH CHECK (true);
