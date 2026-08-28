# Renamed Repo Pilot Scope

> **Archived pre-ADR-012 rollout snapshot.** The bundled v3 workflows and native
> `Trailhead` contexts are historical evidence, not deployable current policy.

This pack captures the renamed Base Camp repo set you referenced and prepares
parallel rollout waves for Phase 2.

## Included Repos

- `cairn`
- `gtm`
- `kindling`
- `komatik-vector`
- `lodge`
- `pack`
- `sundog`
- `trace-floe`
- `trace-triage`
- `trace-watchtower`
- `traverse`

## Execution Defaults

- wave size: 3 repos per wave
- branch model default: `dev/staging/main` (progressive)
- required check contexts:
  - `Trailhead`
  - `CI / lint`
  - `CI / test`
  - `Deploy / staging`
  - `Deploy / production`

Use the existing templates in `examples/policy-pack/phase-2/`:

- `required-checks-and-deployments.md`
- `trailhead-enforced-workflow.yml`
- `threshold-archetypes.yml`
- `canary-promotion-runbook.md`
- `blocked-to-green-runbook.md`

## Files in This Folder

- `repos.yml` - repo metadata and criticality assumptions
- `waves.yml` - parallel execution waves (3 repos each)
- `baseline-targets.md` - prefilled per-repo baseline target sheet
- `org-rollout-checklist.md` - centralized rollout tracker for all waves
