# Agent submission fixture (Gate 1)

Minimal non-Komatik example showing **Gate 1** agent submission checks via the Trailhead Action.

Gate 1 validates PR diffs for agent-quality issues (secrets, destructive SQL, missing RLS, auth on API routes, syntax, etc.) before the deploy gate runs.

## Enable in your repo

1. Add `.trailhead.yml` (or merge the snippet below).
2. Wire the Action with `submission-gate: "true"`.

```yaml
# .trailhead.yml
schema_version: 2

submission:
  enabled: true
  mode: block # or warn while tuning false-positive rate

gate:
  mode: release-ready
  agent_brief: collapsed
```

```yaml
# .github/workflows/trailhead.yml (snippet)
- uses: KomatikAI/trailhead@v4
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    submission-gate: "true"
```

## Komatik fleet only

Set `KOMATIK_INSTANCE: "true"` in the workflow env to enable SOUL integrity and DeployGuard stale-term checks. External repos should omit this.

## Trust scoring (optional)

Pass rolling agent metrics via `TRAILHEAD_AGENT_TRUST_JSON` until hosted trust lookup ships:

```json
{
  "evaluations": 20,
  "releaseReadyCount": 18,
  "revertCount": 0,
  "humanReviewRequiredCount": 2,
  "policyViolationCount": 0,
  "sensitivePathViolationCount": 0,
  "remediationRoundsToReady": [1, 1, 2, 1]
}
```

## Local self-test

Run the engine against sample patches in this directory:

```bash
npm test -- submission-engine
```

See `src/__tests__/submission-engine.test.ts` for programmatic examples.
