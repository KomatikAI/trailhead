# CI Manifest (`ci-manifest.json`)

Path-filtered workflows often **skip** jobs (Playwright, Storybook, deploy previews) when unrelated files change. GitHub Checks may not list those jobs at all, so Trailhead would treat them as **missing** required checks and block the PR.

The **CI manifest** is a small JSON artifact your workflow emits listing each job's outcome. Trailhead reads it via the `ci-manifest-path` action input and merges skip semantics with live Checks API results.

## Schema (v1)

See [`schemas/ci-manifest.v1.json`](schemas/ci-manifest.v1.json).

```json
{
  "schema_version": 1,
  "generated_at": "2026-05-24T12:00:00Z",
  "commit_sha": "abc123",
  "workflow": "CI",
  "run_id": 12345678,
  "jobs": [
    { "name": "CI Gate", "outcome": "ran" },
    { "name": "Playwright", "outcome": "skipped", "reason": "paths-filter" },
    { "name": "Storybook", "outcome": "skipped", "reason": "paths-filter" }
  ]
}
```

| Field            | Description                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `schema_version` | Must be `1`                                                                              |
| `jobs[].name`    | Job or check name — matched against `required_checks` in `.trailhead.yml` (prefix match) |
| `jobs[].outcome` | `ran`, `passed`, `skipped`, `failed`, `pending`, or `cancelled`                                    |
| `jobs[].reason`  | When `outcome` is `skipped`, use `paths-filter` for dorny/paths-filter skips             |

## Action input

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    gate-mode: release-ready
    ci-manifest-path: ci-manifest.json
```

Download the manifest from a prior job artifact if needed:

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    outputs:
      manifest: ${{ steps.manifest.outputs.path }}
    steps:
      # ... run path-filtered jobs ...
      - id: manifest
        run: |
          cat > ci-manifest.json <<'EOF'
          {"schema_version":1,"jobs":[{"name":"CI Gate","outcome":"ran"},{"name":"Playwright","outcome":"skipped","reason":"paths-filter"}]}
          EOF
          echo "path=ci-manifest.json" >> "$GITHUB_OUTPUT"

  gate:
    needs: ci
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: ci-manifest
      - uses: KomatikAI/trailhead@v4
        with:
          gate-mode: release-ready
          ci-manifest-path: ci-manifest.json
```

## Merge behavior

1. Fetch GitHub check runs (Checks API).
2. For each `required_checks` entry, match a live check by name.
3. If no live check exists, look up the job in `ci-manifest.json`.
4. **`skipped` + `paths-filter`** → treat as **skip** (does not block release-ready).
5. Live check results win for jobs that **ran** and published a check run.

## Policy pack example

See [`examples/policy-pack/ci-manifest.example.json`](../examples/policy-pack/ci-manifest.example.json) and [`examples/policy-pack/ci-manifest-workflow.snippet.yml`](../examples/policy-pack/ci-manifest-workflow.snippet.yml).
