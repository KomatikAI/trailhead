# Trailhead App — Deployment Protection Rule

A lightweight webhook server that acts as a GitHub **Custom Deployment Protection Rule**.
When installed on a repository's environment, it automatically evaluates risk and approves
or rejects deployments without any workflow YAML changes.

## How It Works

1. A workflow reaches a job targeting a protected environment (e.g., `production`).
2. GitHub sends a `deployment_protection_rule` webhook to this server.
3. The server fetches the associated PR, scores risk using the **shared risk engine** (`risk-engine.ts`), and responds with `approved` or `rejected`.
4. The deployment proceeds or is blocked based on the response.

## v3 Features

- **Shared risk engine** — uses the same `computeRiskScore` and `decideGate` functions as the Action and MCP server. Scoring is always consistent.
- **Per-environment threshold overrides** — reads `.trailhead.yml` from the repository and applies environment-specific risk/warn thresholds.
- **Deploy outcome webhook** — `/webhook/deploy-outcome` endpoint receives Vercel or generic deployment signals for canary tracking.
- **Service discovery** — `/.well-known/trailhead.json` exposes capabilities for automated integration.
- **Health endpoint** — `GET /health` returns `{ status: "ok" }` for load balancer probes.

## Endpoints

| Method | Path                              | Purpose                                         |
| ------ | --------------------------------- | ----------------------------------------------- |
| POST   | `/webhook`                        | GitHub deployment protection rule webhook       |
| POST   | `/webhook/deploy-outcome`         | Canary/deploy outcome signals (Vercel, generic) |
| POST   | `/webhook/ci-status`              | Signed, repository-scoped external CI status    |
| GET    | `/v1/ci-status/:owner/:repo/:sha` | Authenticated external CI status read           |
| GET    | `/health`                         | Health check for load balancers                 |
| GET    | `/.well-known/trailhead.json`     | Service discovery and capabilities              |

## Environment Variables

| Variable                  | Required           | Description                                                                            |
| ------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| `GITHUB_APP_ID`           | Yes                | GitHub App ID                                                                          |
| `GITHUB_APP_PRIVATE_KEY`  | Yes                | PEM private key (newlines as `\n`)                                                     |
| `GITHUB_WEBHOOK_SECRET`   | Yes for `/webhook` | HMAC-SHA256 secret; missing configuration returns 503                                  |
| `RISK_THRESHOLD`          | No                 | Block above this score (default: 70)                                                   |
| `WARN_THRESHOLD`          | No                 | Warn above this score (default: 55)                                                    |
| `CANARY_WEBHOOK_SECRET`   | For canary ingest  | Required HMAC secret; missing configuration returns 503                                |
| `CI_WEBHOOK_SECRET`       | For CI ingest      | Required HMAC-SHA256 write secret                                                      |
| `CI_STATUS_READ_SECRET`   | For CI reads       | Separate bearer token; configure as Action `ci-external-status-secret`                 |
| `CI_ALLOWED_REPOSITORIES` | For CI             | Comma-separated exact `owner/repo` allowlist; defaults to `GITHUB_REPOSITORY` if unset |
| `PORT`                    | No                 | Server port (default: 3000)                                                            |

## Setup

All webhook mutation routes reject absent/invalid signatures and limit bodies to
256 KiB. The deployment handler also verifies signatures when called directly.
No unsigned development mode is available. These authentication boundaries do not
alter the Action's fail-open default for normal evaluator failures.

Existing App operators must provision the corresponding secrets before deploying
this update. CI publishers must include a full 40-character SHA and an observation
timestamp within five minutes. Reads require a distinct token and an allowed
repository. See [the external CI contract](../docs/ci-external-webhook.md). No live
configuration is changed by the code update.

### Deploy

```bash
# Install dependencies
npm install

# Build
npm run build

# Start
npm start

# Development (with hot reload)
npm run dev
```

### Docker

```bash
docker build -t trailhead-app .
docker run -p 3000:3000 --env-file .env trailhead-app
```

### Register the GitHub App

1. Create a GitHub App with **Repository permissions**:
   - Actions: read
   - Deployments: read + write
   - Contents: read (for `.trailhead.yml`)
2. Subscribe to the `deployment_protection_rule` event
3. Set the webhook URL to `https://your-host/webhook`
4. Install the app on your repository
5. In the repository's environment settings, enable the app as a protection rule

## Per-Environment Overrides

The app reads `.trailhead.yml` from the repository at evaluation time. Environment-specific thresholds override the defaults:

```yaml
environments:
  production:
    risk: 50
    warn: 35
  staging:
    risk: 80
    warn: 60
```

When a deployment targets `production`, the app uses `risk: 50` instead of the default `70`.

## Tech Stack

- **[Hono](https://hono.dev)** — lightweight web framework
- **[@hono/node-server](https://github.com/honojs/node-server)** — Node.js adapter
- **[@octokit/auth-app](https://github.com/octokit/auth-app.js)** — GitHub App authentication
- **risk-engine.ts** — shared scoring module (copied from `src/` at build time via `prebuild` script)
