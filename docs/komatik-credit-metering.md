# Komatik credit metering (Trailhead)

Trailhead participates in the Komatik **prepaid credit** catalog as app `trailhead`, deliverable `deploy_check` (30 credits, Explorer tier minimum — see Komatik `app_action_pricing`).

## When it runs

After each gate evaluation completes, the Action may POST to Komatik **`credit-meter-ingest`** to record one `deploy_check`. Default is **shadow mode** (would-charge only, balance unchanged).

## Enable in workflow

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    gate-mode: release-ready
    credit-meter-url: ${{ secrets.KOMATIK_CREDIT_METER_URL }}
    credit-meter-secret: ${{ secrets.KOMATIK_CREDIT_METER_SECRET }}
    credit-meter-shadow: "true" # flip false after credit_apps.enforced for trailhead
  env:
    TRAILHEAD_CREDIT_USER_ID: ${{ secrets.TRAILHEAD_CREDIT_USER_ID }} # preferred (Komatik auth sub)
    # or TRAILHEAD_CREDIT_USER_EMAIL for pre-SSO email bridge
```

Or set env only (no action inputs):

- `KOMATIK_CREDIT_METER_URL`
- `KOMATIK_CREDIT_METER_SECRET`
- `TRAILHEAD_CREDIT_USER_ID` or `TRAILHEAD_CREDIT_USER_EMAIL`

## Behavior

| Condition                                      | Result                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| URL/secret unset                               | Metering disabled (default for external repos)                      |
| No member identity env                         | Skip (`no_member_identity`) — gate unchanged                        |
| Ingest unreachable                             | Skip (`request_failed`) — **fail-open**                             |
| Shadow mode (default)                          | Ledger row `shadow_debit`, balance unchanged                        |
| `credit-meter-enforce: true` + `allowed:false` | Warning logged; gate still fail-open unless you add separate policy |

Idempotency key: `deploy-check:{evaluation.id}` — safe on Action retries.

## Enforcement cutover (Komatik-side)

Phase 0–1: shadow only. Launch path (same request contract):

```sql
UPDATE public.credit_apps SET enforced = true WHERE app_slug = 'trailhead';
```

Then set `credit-meter-shadow: "false"` in workflows that should real-debit.

## Related

- Komatik migration `20260529120000_credit_system_phase0.sql`
- Lyra wire contract: `Komatik/docs/products/lyra/CREDITS_SSO_CONTRACT.md`
- Hosted evaluation store: [komatik-hosted-store.md](./komatik-hosted-store.md)
