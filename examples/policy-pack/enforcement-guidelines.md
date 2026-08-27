# GitHub Enforcement Guidelines

Use these conventions with the ruleset JSON templates.

## Required Check Naming

- Use stable, explicit check names:
  - `Trailhead — Release Ready` (the custom check published by Trailhead)
  - `CI / lint`
  - `CI / test`
  - `Deploy / staging`
  - `Deploy / production`
- Do not use ambiguous names like `build`, `checks`, or `pipeline`.
- Require the custom `Trailhead — Release Ready` check from GitHub Actions, not the
  workflow job name; pin GitHub Actions as the expected source.
- Keep one logical concern per check context so required checks stay meaningful.

## Required Deployments

- `main`-only flow: require `production`.
- progressive flow: require `staging` and `production` at their respective gates.

## Restricted Bypass Pattern

- Allow bypass for as few actors as possible.
- Prefer PR-only bypass mode over always bypass.
- For a recorded risk exception, require both the `trailhead-override` label and a
  `trailhead-override: <rationale>` PR comment.
- Review override age weekly; auto-expire with `override-expires-at`.
