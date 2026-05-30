# Advanced & fleet features

Most Trailhead users never need this page. It covers **optional** capabilities built for AI-agent fleets and Komatik dogfood — agent trust loops, verdict contracts, credit metering, and instance-gated checks.

**Start elsewhere:** [getting-started.md](./getting-started.md) · [presets/README.md](../presets/README.md)

---

## Agent submission gate (Gate 1 + Phase 0)

Enable when AI-authored code merges to your repo:

```yaml
submission:
  enabled: true
  mode: block # or warn while tuning
```

Workflow:

```yaml
submission-gate: "true"
```

Reference: [submission-gate.md](./submission-gate.md)

### Fleet-only checks

These run only when `KOMATIK_INSTANCE=true` (Action env):

- `soul_integrity` — Komatik agent SOUL file rules
- Stale naming / slug checks tied to Komatik migration

External users get the full public Gate 1 set without these.

---

## Agent trust loop

Dynamic trust adjusts gate strictness from rolling agent outcomes.

| Piece                                             | Doc                                                  |
| ------------------------------------------------- | ---------------------------------------------------- |
| Metrics schema `trailhead.agent_trust_metrics.v1` | [agent-trust-metrics.md](./agent-trust-metrics.md)   |
| Post-merge feedback `trailhead.feedback.v1`       | [agent-trust-feedback.md](./agent-trust-feedback.md) |
| Gate verdict `trailhead.verdict.v1`               | [verdict.md](./verdict.md)                           |

Inject metrics at runtime:

```yaml
env:
  TRAILHEAD_AGENT_TRUST_JSON: ${{ secrets.AGENT_TRUST_JSON }}
```

Shadow mode (log only):

```yaml
env:
  TRAILHEAD_TRUST_SHADOW: "true"
```

Collectors live in **your** infrastructure (events DB → metrics JSON). Trailhead owns schemas and scoring — see [agent-trust-metrics.md#komatik-fleet-integration](./agent-trust-metrics.md#komatik-fleet-integration).

---

## MCP tools (26)

For Cursor, Claude Code, or custom agents:

- `validate-submission`, `apply-autofix`, `get-trust-score`
- `evaluate-policy`, `get-remediation`, `subscribe-events`

See [mcp/README.md](../mcp/README.md).

---

## Komatik credit metering (optional)

Action inputs for hosted `deploy_check` billing — **ignore unless you use Komatik metering**:

| Input                  | Purpose            |
| ---------------------- | ------------------ |
| `credit-meter-url`     | Ingest endpoint    |
| `credit-meter-secret`  | Shared secret      |
| `credit-meter-shadow`  | Log only (default) |
| `credit-meter-enforce` | Deduct credits     |

See [komatik-credit-metering.md](./komatik-credit-metering.md).

---

## Shadow comparison (maintainers)

Compare legacy vs Trailhead submission gate on real bundles:

```bash
npm run build:cli
KOMATIK_AGENTS_ROOT=/path/to/agents npm run shadow-compare
```

Komatik-internal; not required for adoption.

---

## Roadmap

Full agent-autonomy plan: [roadmap-v4.3-agent-autonomy.md](./roadmap-v4.3-agent-autonomy.md)
