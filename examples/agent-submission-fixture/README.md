# Agent submission fixture (Gate 1 + Phase 0)

Minimal non-Komatik example showing **Gate 1** agent submission checks via the Trailhead Action.

Gate 1 validates PR diffs for agent-quality issues (secrets, destructive SQL, missing RLS, auth on API routes, syntax, etc.) before the deploy gate runs. **Phase 0** (v4.4.2) adds advisory heuristics on `agents/*/suggestions/**/*.md` (output size, preambles, action extraction, etc.) — measurement only, does not block.

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
- uses: KomatikAI/trailhead@v4.4.2
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    submission-gate: "true"
```

## Komatik fleet only

Set `KOMATIK_INSTANCE: "true"` in the workflow env to enable SOUL integrity and DeployGuard stale-term checks. External repos should omit this.

## MCP validation

Agents can call **`validate-submission`** with the same file patches before opening a PR:

```json
{
  "files": [{ "filename": "agents/coordinator/suggestions/brief.md", "content": "..." }],
  "komatik_instance": true,
  "mode": "block"
}
```

Use **`get-trust-score`** with rolling metrics and **`apply-autofix`** to plan allowlisted fixes from remediation output.

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

Run the engine against sample patches:

```bash
npm test -- submission-engine phase0-detectors
```

See `src/__tests__/submission-engine.test.ts` and `src/__tests__/phase0-detectors.test.ts`. Full reference: [docs/submission-gate.md](../../docs/submission-gate.md).
