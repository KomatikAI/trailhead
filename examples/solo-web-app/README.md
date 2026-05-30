# Solo web app example

Minimal Trailhead setup for a typical single-repo app — no agent trust, no fleet flags.

## Files

Copy into your repo root:

```bash
cp examples/solo-web-app/.trailhead.yml .
cp examples/solo-web-app/trailhead-workflow.snippet.yml .github/workflows/trailhead.yml
```

Or run:

```bash
npx @komatikai/trailhead init --preset solo
```

## What it does

- Waits for `CI` and `Build` checks
- Blocks above risk **70**, warns above **55**
- Publishes **Trailhead — Release Ready** as the single merge gate

## Customize

Edit `contexts[].ci.required_checks` to match your GitHub Actions job names:

```bash
npx @komatikai/trailhead doctor --offline
```

See [docs/getting-started.md](../docs/getting-started.md).
