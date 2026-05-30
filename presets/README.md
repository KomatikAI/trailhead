# Trailhead policy presets

Copy a preset into your repo as `.trailhead.yml`, or run `npx @komatikai/trailhead init` and pick your audience — the wizard generates equivalent config.

| Preset                                 | Who it's for          | Highlights                                                              |
| -------------------------------------- | --------------------- | ----------------------------------------------------------------------- |
| [`solo.yml`](./solo.yml)               | Solo dev / small team | Release-ready on `main`, CI + risk, no extras                           |
| [`team.yml`](./team.yml)               | Platform / eng lead   | Progressive `dev` → `staging` → `main`, per-context thresholds          |
| [`agent-guard.yml`](./agent-guard.yml) | Shops using AI on PRs | Submission gate, remediation, agent policies                            |
| [`ops.yml`](./ops.yml)                 | Ops-minded teams      | Freeze windows, canary hook, env thresholds (+ DORA/health in workflow) |

## Quick adopt

```bash
curl -fsSL https://raw.githubusercontent.com/KomatikAI/trailhead/dev/presets/solo.yml -o .trailhead.yml
```

Or from a clone:

```bash
cp presets/solo.yml .trailhead.yml
```

Add the workflow from [docs/getting-started.md](../docs/getting-started.md) or run `npx @komatikai/trailhead init`.

## Legacy alias

[`trailhead-strict-agents.yml`](./trailhead-strict-agents.yml) is kept for backward compatibility — prefer **`agent-guard.yml`** for new repos.

## Fleet / advanced

Komatik-only checks (`soul_integrity`, stale naming) require `KOMATIK_INSTANCE=true` — not included in public presets. See [docs/advanced-fleet.md](../docs/advanced-fleet.md).
