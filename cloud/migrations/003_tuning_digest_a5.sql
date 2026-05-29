-- A5 tuning digest — agent provenance + detector downgrade audit
-- Trailhead Cloud reference migration.
-- Komatik fleet store: apply equivalent via Komatik PR (never MCP prod DDL).

ALTER TABLE trailhead_evaluations
  ADD COLUMN IF NOT EXISTS agent_provenance_id text;

CREATE INDEX IF NOT EXISTS idx_trailhead_evals_agent_provenance
  ON trailhead_evaluations (agent_provenance_id, created_at DESC)
  WHERE agent_provenance_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS trailhead_detector_downgrades (
  detector_code text PRIMARY KEY,
  downgraded_at timestamptz NOT NULL DEFAULT now(),
  fp_rate_at_trigger numeric NOT NULL,
  tuning_issue_url text,
  reverted_at timestamptz,
  reverted_by text
);

ALTER TABLE trailhead_detector_downgrades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON trailhead_detector_downgrades
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON COLUMN trailhead_evaluations.agent_provenance_id IS
  'Denormalised pr.provenance.source for fast agent group-by (A5).';

-- Best-effort backfill from pr JSONB
UPDATE trailhead_evaluations
SET agent_provenance_id = COALESCE(
  pr->'provenance'->>'source',
  substring(pr->>'headRef' from '^agent/([^/]+)/')
)
WHERE agent_provenance_id IS NULL
  AND pr IS NOT NULL;
