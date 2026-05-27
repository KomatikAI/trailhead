# Trailhead CLI

Interactive setup wizard and diagnostics for Trailhead. Generates `.trailhead.yml`, validates policy files, and compares configured CI check names against GitHub.

## Usage

```bash
npx @komatikai/trailhead init
npx @komatikai/trailhead doctor
```

### `trailhead init`

No installation required. The wizard walks you through:

1. **Gate mode** — release-ready, advisory, or risk-only
2. **Branch model** — main-only or progressive promotion paths
3. **Required checks** — CI job names for release-ready contexts
4. **Sensitivity patterns** — which file paths are high/medium risk
5. **Thresholds** — risk and warn scores
6. **Freeze windows** — days and hours when deployments are blocked
7. **Environments** — per-environment threshold overrides
8. **Services** — monorepo service boundaries with path patterns
9. **Security gate** — Code Scanning alerts as a risk factor
10. **Canary tracking** — deploy outcome webhook type
11. **DORA metrics** — compute DORA-5 alongside gate evaluations
12. **Health checks** — URLs to probe before scoring
13. **OpenTelemetry** — OTLP endpoint for evaluation span export
14. **Evaluation store** — URL for persisting evaluations to a trend dashboard

### `trailhead doctor`

Validates `.trailhead.yml` (or legacy `.deployguard.yml`) and optionally compares `contexts[].ci.required_checks` against recent GitHub check runs.

```bash
# Config-only validation (no GitHub API)
trailhead doctor --offline

# Compare against GitHub (needs token + repo)
GITHUB_TOKEN=ghp_... trailhead doctor --repo owner/repo

# Machine-readable output
trailhead doctor --json
```

Options:

| Flag                  | Description                            |
| --------------------- | -------------------------------------- |
| `--path <dir>`        | Directory to scan (default: cwd)       |
| `--repo <owner/name>` | GitHub repository for check lookup     |
| `--token <token>`     | GitHub token (default: `GITHUB_TOKEN`) |
| `--ref <sha>`         | Commit SHA for check runs              |
| `--offline`           | Skip GitHub API comparison             |
| `--json`              | Output report as JSON                  |

Exit code `0` when there are no errors; `1` when config is missing/invalid or structural errors are found. Warnings do not fail the command.

## Output (`init`)

The wizard generates two files:

- **`.trailhead.yml`** — per-repo configuration
- **`.github/workflows/trailhead.yml`** — GitHub Actions workflow with selected features

## Development

```bash
cd cli
npm install
npm run build
node dist/index.js doctor --offline --path ..
```

The CLI copies shared validation modules from `src/` during prebuild. Build output goes to `cli/dist/` (gitignored — build before npm publish).

## Publishing

```bash
cd cli
npm run build
npm publish
```

The package is published as `@komatikai/trailhead` on npm.
