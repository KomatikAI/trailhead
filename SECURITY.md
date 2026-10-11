# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 4.x     | Yes       |
| < 4.0   | No        |

## Reporting a Vulnerability

If you discover a security vulnerability in Trailhead, please report it responsibly.

**Do not open a public issue.**

Instead, report it privately through
[GitHub private vulnerability reporting](https://github.com/KomatikAI/trailhead/security/advisories/new),
or email **security@komatik.ai**. Include:

1. A description of the vulnerability
2. Steps to reproduce
3. Impact assessment (what an attacker could achieve)
4. Any suggested fix (optional)

We will acknowledge your report within 48 hours and provide a timeline for a fix within 5 business days.

## Scope

The following are in scope:

- The GitHub Action (`action.yml` + `dist/index.js`)
- The GitHub App webhook handler (`app/`)
- The CLI (`cli/`)
- Risk scoring logic (`src/risk-engine.ts`)
- Configuration parsing (`src/config.ts`, `.trailhead.yml`)
- Trailhead Cloud: the hosted API (`cloud/`) and the site's billing and key-claim routes (`site/`)

The following are out of scope:

- The MCP server (`mcp/`) — internal tooling, not publicly deployed
- Example configurations in `examples/` — reference only, not production code
- Third-party dependencies (report upstream)

## Security Design

Trailhead is designed with these security principles:

- **Fail-open by default** — if Trailhead itself errors, deployments proceed (configurable via `fail-mode: closed`)
- **No secrets required** — works with the automatic `GITHUB_TOKEN`, no API keys needed for basic operation
- **Read-only by default** — only reads PR data and code scanning alerts; label/comment writes require explicit `pull-requests: write`
- **No code execution** — Trailhead analyzes metadata (file names, line counts, alert counts), never executes or evaluates PR code
- **HMAC verification** — webhook endpoints verify signatures when secrets are configured
- **Minimal permissions** — the action requests only `contents: read`, `checks: write`, `pull-requests: write`, and `security-events: read`
