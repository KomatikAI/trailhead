# Cross-Repo Impact (E16)

Trailhead detects when a PR touches **contract surfaces** and resolves **downstream consumer repos** from your config. Affected consumers appear in the Release Ready PR comment; optional satellite webhooks notify downstream teams.

## Configuration

```yaml
schema_version: 2

# Alias → external repo mapping
consumer_registry:
  web:
    repo: KomatikAI/frontend
    branch: main
  mobile:
    repo: KomatikAI/mobile-app

services:
  api:
    paths:
      - "src/api/**"
    contracts:
      - "src/api/contracts/**"
      - "openapi/**"
    consumers:
      - web # resolves via consumer_registry
      - repo: KomatikAI/worker # inline external ref
        branch: main
    notify_webhook: https://hooks.example.com/api-contract-change

policies:
  cross_repo_impact:
    enabled: true
    mode: warn
    consumer_registry_path: .trailhead/consumers.json # optional external file
```

### Consumer formats

| Form                 | Example                                           | Use case                         |
| -------------------- | ------------------------------------------------- | -------------------------------- |
| Alias string         | `web`                                             | Resolved via `consumer_registry` |
| Inline repo ref      | `{ repo: org/repo, branch: main }`                | External satellite repo          |
| Per-consumer webhook | `{ repo: org/repo, notify_webhook: https://... }` | Notify one downstream            |

### External registry file

`.trailhead/consumers.json`:

```json
{
  "billing-ui": {
    "repo": "KomatikAI/billing-portal",
    "branch": "main",
    "notify_webhook": "https://hooks.example.com/billing"
  }
}
```

Set `policies.cross_repo_impact.consumer_registry_path` to load it. Inline `consumer_registry` in `.trailhead.yml` takes precedence on key collision.

## Satellite webhooks

When contract files change, Trailhead POSTs a `contract_change` event to:

1. Each affected service's `notify_webhook`
2. Each resolved consumer's `notify_webhook` (if set)

Payload shape:

```json
{
  "event": "contract_change",
  "source_repo": "KomatikAI/platform",
  "commit_sha": "abc123",
  "pr_number": 42,
  "service": "api",
  "touched_files": ["src/api/contracts/users.json"],
  "consumers": [{ "id": "web", "repo": "KomatikAI/frontend", "branch": "main" }],
  "timestamp": "2026-05-24T12:00:00Z"
}
```

Delivery is **fail-open** — webhook errors never block the merge gate.

## PR comment

Release-ready mode adds a **Cross-Repo Impact** section listing each affected service, changed contract files, and downstream repos.

See [`examples/policy-pack/cross-repo-impact.example.yml`](../examples/policy-pack/cross-repo-impact.example.yml).
