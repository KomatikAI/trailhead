import { formatDoctorReport, runDoctor } from "./shared/doctor.js";

function printUsage(): void {
  process.stdout.write(`
Trailhead Doctor — validate .trailhead.yml and compare CI check names

Usage:
  trailhead doctor [options]

Options:
  --path <dir>       Directory to scan (default: cwd)
  --repo <owner/name>  GitHub repository for check lookup
  --token <token>    GitHub token (default: GITHUB_TOKEN)
  --ref <sha>        Commit SHA for check runs (default: latest open PR or default branch)
  --offline          Skip GitHub API check comparison
  --json             Output report as JSON
  -h, --help         Show this help

Environment:
  GITHUB_TOKEN       Personal access token with checks:read
  GITHUB_REPOSITORY  owner/repo when running in GitHub Actions
`);
}

export async function runDoctorCommand(args: string[]): Promise<number> {
  if (args.includes("-h") || args.includes("--help")) {
    printUsage();
    return 0;
  }

  let cwd = process.cwd();
  let repo: string | undefined;
  let token: string | undefined;
  let ref: string | undefined;
  let offline = false;
  let json = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--offline") {
      offline = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--path" && args[i + 1]) {
      cwd = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--repo" && args[i + 1]) {
      repo = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--token" && args[i + 1]) {
      token = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--ref" && args[i + 1]) {
      ref = args[i + 1];
      i += 1;
      continue;
    }
    process.stderr.write(`Unknown option: ${arg}\n`);
    printUsage();
    return 2;
  }

  const report = await runDoctor({
    cwd,
    offline,
    githubToken: token,
    repo,
    ref,
  });

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatDoctorReport(report)}\n`);
  }

  return report.ok ? 0 : 1;
}
