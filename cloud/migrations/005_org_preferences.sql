-- 005_org_preferences — DEVIATION from the billing contract DDL (reported to coordinator).
--
-- The contract's org_settings table (001) covers billing only: plan/seats/sso.
-- The pre-existing Trailhead Cloud digest + auto-downgrade features persist two
-- extra per-org preference blobs (OrgSettings.digest / OrgSettings.tuning) that
-- getOrgSettings/updateOrgSettings must round-trip. These are additive nullable
-- columns and do not alter the billing contract semantics.

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS digest jsonb,
  ADD COLUMN IF NOT EXISTS tuning jsonb;
