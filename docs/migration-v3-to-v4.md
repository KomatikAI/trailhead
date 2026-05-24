# Migrating Trailhead v3 → v4

Trailhead v4 introduces the **Release Readiness Gate** — a composite check that reads live CI status alongside risk scoring. v3 configs continue to work unchanged.

## Step 1: Choose a gate mode

| Mode            | When to use                                  |
| --------------- | -------------------------------------------- |
| `risk-only`     | Keep v3 behavior (default for v1 configs)    |
| `advisory`      | See CI + risk rollup without blocking merges |
| `release-ready` | Single required check (v4 product default)   |

Set in `.trailhead.yml`:

```yaml
schema_version: 2
gate:
  mode: release-ready
```

Or via workflow input (overrides config):

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    gate-mode: release-ready
```

## Step 2: Add contexts for branch-aware policy

Replace per-workflow `risk-threshold` hacks with declarative contexts:

```yaml
contexts:
  - name: feature
    match:
      base_branch: [dev, develop]
    thresholds:
      risk: 70
      warn: 55
    ci:
      required_checks: [CI Gate, Build]
      missing_required: skip # path-filtered jobs

  - name: promotion
    match:
      base_branch: [staging, main, master]
    environment: production
    thresholds:
      risk: 95
    ci:
      required_checks: [CI Gate, Build, Playwright, Security Gate]
```

**Note:** `profiles` (file-based weight overrides) are unchanged. Contexts handle branch/CI/threshold policy.

## Step 3: Update branch protection

1. Remove separate required checks for CI Gate + Trailhead (if both were required).
2. Add single required check: **`Trailhead — Release Ready`**
3. Keep CI jobs running — Trailhead reads their check results via GitHub Checks API.

## Step 4: Enable CI wait (optional)

For release-ready mode, Trailhead can poll until required checks finish:

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    gate-mode: release-ready
    wait-for-checks: true
    wait-timeout-minutes: 30
```

## Step 5: Verify on a test PR

- Open a feature PR → context `feature` should match, lower threshold
- Open a promotion PR → context `promotion` should match, Playwright required
- Check the unified PR comment for CI table + release readiness

## Breaking changes

None for v1 configs. v2 configs default to `release-ready` mode when `schema_version: 2` is set without explicit `gate.mode`.

## Rollback

Set `gate-mode: risk-only` in workflow or revert `schema_version` to `1`.
