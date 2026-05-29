# Komatik PR — A5 store migration (`agent_provenance_id`)

> **Do not** apply this migration via Supabase MCP against production.
> Ship through **Komatik PR → merge → deploy** only.

## What this enables

- `agent_provenance_id` column on `trailhead_evaluations` (from Trailhead `buildEvaluationStoreRow`)
- Per-agent analytics and tuning digest group-by in Komatik / Trailhead Cloud
- Optional `trailhead_detector_downgrades` audit table for auto-downgrade (Cloud in-memory tier already works standalone)

## Steps

1. Copy SQL from [`docs/komatik-migrations/20260529180000_trailhead_a5_agent_provenance.sql`](../komatik-migrations/20260529180000_trailhead_a5_agent_provenance.sql) into `Komatik/supabase/migrations/` with a new timestamp if needed.

2. Update `platform/web/lib/trailhead/evaluation-store.ts` — add to `mapEvaluationStoreRow`:

   ```typescript
   agent_provenance_id:
     pick(body, "agentProvenanceId", "agent_provenance_id") ?? null,
   ```

3. Merge Komatik PR → verify Vercel deploy → confirm Migration Drift Check green.

4. Subscribe digest webhook (Komatik or Trailhead Cloud):

   ```http
   PUT /v1/digest/subscribe
   Authorization: Bearer <trailhead-api-key>

   {
     "enabled": true,
     "channel": "webhook",
     "destination": "https://hooks.slack.com/services/...",
     "fpThreshold": 15
   }
   ```

5. Schedule daily delivery (Cloud env or external cron):

   ```http
   POST /v1/digest/tuning/deliver?days=7
   Authorization: Bearer <trailhead-api-key>
   ```

   Cloud server: set `TRAILHEAD_CLOUD_DIGEST_CRON=1` and `TRAILHEAD_CLOUD_DIGEST_INTERVAL_HOURS=24`.

## Verification

```bash
# After an agent PR gate run on a fleet repo:
curl -s "https://komatik.ai/api/trailhead/evaluations?repo_id=KomatikAI/cairn&pr_number=N&limit=1" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" | jq '.evaluations[0].agent_provenance_id'
```

## Related

- [komatik-hosted-store.md](../komatik-hosted-store.md)
- [tuning-digest-spec.md](../../cloud/docs/tuning-digest-spec.md)
