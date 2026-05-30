# Trailhead CLI

Interactive setup wizard and diagnostics for Trailhead. Generates `.trailhead.yml`, validates policy files, compares configured CI check names against GitHub, and runs the submission gate (`validate-submission`).

## Install (no build required)

The published npm package ships a **prebuilt JS bundle** (`dist/index.js`) plus **`@swc/core`** as a runtime dependency (one platform-native binding installed via npm optionalDependencies — ~25 MB download, not 135 MB). No repo clone or local build required.

```bash
npx @komatikai/trailhead init              # interactive — pick solo / team / agent / ops
npx @komatikai/trailhead init --preset solo
npx @komatikai/trailhead doctor --offline
```

Pin a version for CI:

```bash
npm install -D @komatikai/trailhead@4.4.5
npx trailhead validate-submission --input bundle.json
```

Persona guide: [docs/getting-started.md](../docs/getting-started.md) · Presets: [presets/README.md](../presets/README.md)

### Migrating from vendored `cli-dist`

Komatik agents and other repos that vendor `trailhead/cli-dist/` can replace the copy with an npm pin:

```bash
npm install -D @komatikai/trailhead@<tag>
# invoke: npx trailhead validate-submission …
```

Set `TRAILHEAD_CLI=$(npm root)/.bin/trailhead` (or `npx trailhead`) in shadow-compare harnesses instead of a repo-relative `cli/dist/index.js`.

## Usage

### `trailhead init`

Interactive wizard — no GitHub token required. Creates `.trailhead.yml` and `.github/workflows/trailhead.yml`.

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

| Flag                  | Description                            |
| --------------------- | -------------------------------------- |
| `--path <dir>`        | Directory to scan (default: cwd)       |
| `--repo <owner/name>` | GitHub repository for check lookup     |
| `--token <token>`     | GitHub token (default: `GITHUB_TOKEN`) |
| `--ref <sha>`         | Commit SHA for check runs              |
| `--offline`           | Skip GitHub API comparison             |
| `--json`              | Output report as JSON                  |

Exit code `0` when there are no errors; `1` when config is missing/invalid or structural errors are found. Warnings do not fail the command.

### `trailhead validate-submission`

Runs the canonical Gate 1 engine on a JSON payload of files (used by komatik-agents and MCP). See `cli/src/index.ts` for input shape.

## Development (this repo)

Source lives in `cli/src/`; shared modules are copied from `src/` at build time. **Do not commit `cli/dist/`** — CI and the release workflow build the bundle.

```bash
# From repo root
npm ci
npm run build:cli
node cli/dist/index.js doctor --offline --path .

# Typecheck CLI sources only
cd cli && npm ci && npm run typecheck
```

Bundle pipeline: `scripts/build-cli-bundle.mjs` → `ncc` with `@swc/core` external (Action bundle still vendors `swc.*.node` via `copy-swc-bindings.mjs`).

## Publishing

On tag push (`v*`), `.github/workflows/release.yml` runs `npm run build:cli`, `npm ci --omit=dev` in `cli/`, then publishes `@komatikai/trailhead`. The npm tarball ships `dist/` plus `@swc/core` in `dependencies` (platform binding resolved at install).
