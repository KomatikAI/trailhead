# Post-merge trust feedback (v1)

Correlates **post-merge outcomes** (CI, reverts, remediation rounds) to agent trust metrics. Closes the loop for outcome-based fields in `AgentTrustMetrics` that gate decisions alone cannot populate.

Reference collector: [KomatikAI/agents PR #206](https://github.com/KomatikAI/agents/pull/206) (`scripts/lib/agent-trust-feedback.js` — slim to product `rollupFeedbackForAgent` in follow-up).

Related: [agent-trust-metrics.md](./agent-trust-metrics.md) · Epic [#252](https://github.com/KomatikAI/trailhead/issues/252) shipped ([#261](https://github.com/KomatikAI/trailhead/pull/261)) · Issue [#257](https://github.com/KomatikAI/trailhead/issues/257)

## Schema

- **Event schema id:** `trailhead.feedback.v1`
- **Zod export:** `src/agent-trust-feedback.ts`
- **Example events:** `examples/agent-trust-feedback.v1.json`

### Event fields

| Field                | Required | Notes                                                                                   |
| -------------------- | -------- | --------------------------------------------------------------------------------------- |
| `outcome`            | yes      | `ci_pass` \| `ci_fail` \| `revert` \| `rollback` \| `rounds_to_green` \| `human_review` |
| `observed_at`        | yes      | ISO-8601 timestamp                                                                      |
| `agent_id`           | no       | Preferred attribution key                                                               |
| `head_ref`           | no       | Resolved via `agent/<id>/…` when `agent_id` absent                                      |
| `submission_id`      | no       | Suggestion bundle / submission correlation                                              |
| `pr_number`          | no       | GitHub PR number                                                                        |
| `evaluation_id`      | no       | Trailhead evaluation id (`dg-…`)                                                        |
| `project_slug`       | no       | Used by collectors for ambiguous CI attribution                                         |
| `remediation_rounds` | no       | Required for `rounds_to_green`                                                          |
| `metadata`           | no       | Adapter-specific payload (title, ref, workflow run id)                                  |

### Batch envelope

Collectors may emit a batch for storage or debugging:

```json
{
  "schema": "trailhead.feedback.v1",
  "collected_at": "2026-05-29T12:00:00.000Z",
  "events": ["... TrustFeedbackEvent ..."],
  "unattributed": { "ci_failures": 3, "reverts": 0 }
}
```

## Mapping → `AgentTrustMetrics`

| Feedback outcome      | Metrics fields                                                                  | Semantics                                                       |
| --------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `ci_fail`             | `feedback.ciFailures`, +1 `humanReviewRequiredCount`, +1 `policyViolationCount` | Post-merge CI regression attributed to agent                    |
| `revert` / `rollback` | `feedback.reverts`, +1 `revertCount`                                            | Merged agent work reverted                                      |
| `human_review`        | `feedback.humanReview`, +1 `humanReviewRequiredCount`                           | Escalation / block requiring human follow-up                    |
| `rounds_to_green`     | append `remediationRoundsToReady[]`                                             | Loop rounds until release-ready (requires `remediation_rounds`) |
| `ci_pass`             | (none)                                                                          | Positive signal; optional for future scoring                    |

Use `rollupFeedbackForAgent()` + `mergeFeedbackIntoMetrics()` from `src/agent-trust-feedback.ts` when building collector output.

**When feedback is absent:** collectors should leave `revertCount` / `remediationRoundsToReady` at 0 and rely on gate penalty signals (#254). Cold-start (#253) counts optional `feedback.*` toward minimum evidence.

## Attribution rules

1. **`agent_id` present** → use directly.
2. **`head_ref` matches `agent/<agent-id>/…`** → resolve agent id from branch pattern.
3. **`metadata.head_ref` / `metadata.ref`** → same resolution as (2).
4. **Otherwise** → event is **unattributed**; increment batch `unattributed.*` counters. Do not invent agent blame.

Komatik dogfood adds project_slug + recency heuristics when multiple agents share a project — see agents `agent-trust-feedback.js`. Product schema supports `project_slug`; heuristics remain collector-specific until promoted.

## Ingestion surfaces (adopter options)

| Surface                        | Status                 | Notes                                                                         |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------------- |
| **Reference collector**        | Dogfood in agents #203 | Queries fleet event store                                                     |
| **Webhook adapter**            | Spec only              | CI workflow `workflow_run` → map conclusion to `ci_pass`/`ci_fail` + head_ref |
| **GitHub App extension**       | Future                 | Attach feedback on deploy/canary webhooks                                     |
| **Evaluation store extension** | Future                 | Komatik hosted store post-merge fields                                        |

### Workflow template (sketch)

```yaml
- name: Report Trailhead feedback
  if: always() && github.event.pull_request.head.ref != ''
  run: |
    curl -sf "$TRAILHEAD_FEEDBACK_WEBHOOK" -d "$(jq -n \
      --arg ref "${{ github.head_ref }}" \
      --arg outcome "${{ job.status == 'success' && 'ci_pass' || 'ci_fail' }}" \
      '{ outcome: $outcome, head_ref: $ref, observed_at: (now|todate) }')"
```

Set `TRAILHEAD_FEEDBACK_WEBHOOK` to your collector endpoint; collector translates events → `AgentTrustMetrics.feedback` before injecting `TRAILHEAD_AGENT_TRUST_JSON`.

## Honest gaps (dogfood oracle)

- Many CI failure rows lack stable `agent_id` — unattributed counts are expected.
- `remediationRoundsToReady` requires explicit `rounds_to_green` events with `remediation_rounds`; gate decisions alone do not populate this field.
- Binary gate `allow` is non-discriminating — use penalty `total_score` for pre-merge quality (#254).
