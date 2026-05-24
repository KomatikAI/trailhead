# Trailhead Cloud API

First-party evaluation store for the Trailhead Cloud tier (v4.1).

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/v1/evaluations` | Ingest gate evaluation (Idempotency-Key supported) |
| `GET` | `/v1/evaluations` | List evaluations for authenticated org |
| `POST` | `/v1/deploy-events` | Record deploy outcome for CFR correlation |
| `GET` | `/v1/orgs` | Org metadata for API key |
| `GET` | `/v1/repos` | Repos auto-registered on first evaluation |

See [openapi.yaml](./openapi.yaml) for the full contract.

## Local development

```bash
export TRAILHEAD_CLOUD_API_KEYS="komatik:Komatik:thk_dev_key"
npm ci
npm run dev   # http://localhost:3101
npm test
```

Workflows can target local Cloud with:

```yaml
env:
  TRAILHEAD_CLOUD_API_BASE: http://localhost:3101
```

## Action integration

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    trailhead-api-key: ${{ secrets.TRAILHEAD_API_KEY }}
```

See [docs/evaluation-storage.md](../docs/evaluation-storage.md).
