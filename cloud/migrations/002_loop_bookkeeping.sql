-- A4 loop bookkeeping columns for trailhead_evaluations
-- Apply in Supabase SQL editor or via migration tooling.

ALTER TABLE trailhead_evaluations
  ADD COLUMN IF NOT EXISTS remediation jsonb,
  ADD COLUMN IF NOT EXISTS loop_round integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS previous_evaluation_id text,
  ADD COLUMN IF NOT EXISTS fixes_resolved jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fixes_introduced jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pr jsonb;

CREATE INDEX IF NOT EXISTS idx_trailhead_evals_repo_pr_created
  ON trailhead_evaluations (repo_id, pr_number, created_at DESC)
  WHERE pr_number IS NOT NULL;

COMMENT ON COLUMN trailhead_evaluations.loop_round IS
  'Remediation loop round for this PR (0 = first gate run).';
COMMENT ON COLUMN trailhead_evaluations.previous_evaluation_id IS
  'Prior evaluation id for the same PR, used to diff fixes_resolved/introduced.';
