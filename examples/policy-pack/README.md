# Trailhead Policy Pack

This pack provides Phase 1 baseline artifacts for consistent org rollout:

- Starter `.trailhead.yml` configs
- Branch strategy variants (`main` only, or `dev`/`staging`/`main`)
- GitHub ruleset templates for enforcement
- Pilot baseline capture template
- Historical Phase 2 enforcement snapshot (pre-ADR-012; reference only)

## Files

- `trailhead-starter.main-only.v2.yml` — current release-ready config
- `trailhead-starter.progressive.v2.yml` — current release-ready config
- `trailhead-starter.main-only.yml` — legacy risk-only config; does not match the current ruleset
- `trailhead-starter.progressive.yml` — legacy risk-only config; does not match the current ruleset
- `github-ruleset.main-only.json`
- `github-ruleset.progressive.json`
- `enforcement-guidelines.md`
- `pilot-baseline-template.md`
- `ci-manifest.example.json` — sample path-filter manifest (v4.2)
- `ci-manifest-workflow.snippet.yml` — emit manifest + gate job pattern
- `cross-repo-impact.example.yml` — consumer registry + satellite webhooks (v4.2)
- `consumers.example.json` — external consumer registry file
- `phase-2/`
  - archived pre-ADR-012 bundles; do not deploy their native `Trailhead` contexts

## Usage

1. Pick the `.v2.yml` starter config that matches your branch model. It publishes the
   `Trailhead — Release Ready` custom check required by the matching ruleset.
2. Apply the matching ruleset template in your GitHub org/repo settings.
3. Run the pilot baseline template before switching from advisory to enforcement.
4. Track override and rollback trend lines at each phase boundary.
5. Do **not** deploy `phase-2/` directly. It is a historical snapshot that requires
   native `Trailhead` workflow-job contexts and v3. Use the current top-level v4
   rulesets/workflow guidance instead.
