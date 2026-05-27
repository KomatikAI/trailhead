import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectConfiguredChecks,
  compareConfiguredChecks,
  formatDoctorReport,
  loadRepoConfig,
  parseRepoRef,
  runDoctor,
  validateConfigStructure,
} from "../doctor.js";
import { parseRepoConfigContent } from "../config-core.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trailhead-doctor-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("parseRepoRef", () => {
  it("parses owner/repo", () => {
    expect(parseRepoRef("KomatikAI/trailhead")).toEqual({
      owner: "KomatikAI",
      repo: "trailhead",
    });
  });

  it("rejects invalid refs", () => {
    expect(parseRepoRef("not-a-repo")).toBeNull();
  });
});

describe("loadRepoConfig", () => {
  it("loads .trailhead.yml from a directory", () => {
    const dir = makeTempDir();
    fs.writeFileSync(
      path.join(dir, ".trailhead.yml"),
      `schema_version: 2
gate:
  mode: release-ready
thresholds:
  risk: 70
  warn: 55
contexts:
  - name: main
    match:
      base_branch: [main]
    ci:
      required_checks: [CI Gate]
`,
    );

    const loaded = loadRepoConfig(dir);
    expect(loaded.configPath).toContain(".trailhead.yml");
    expect(loaded.config?.gate.mode).toBe("release-ready");
  });

  it("falls back to .deployguard.yml", () => {
    const dir = makeTempDir();
    fs.writeFileSync(
      path.join(dir, ".deployguard.yml"),
      `thresholds:
  risk: 70
  warn: 55
`,
    );

    const loaded = loadRepoConfig(dir);
    expect(loaded.configPath).toContain(".deployguard.yml");
    expect(loaded.config?.thresholds.risk).toBe(70);
  });
});

describe("validateConfigStructure", () => {
  it("warns when configured checks are missing on GitHub", () => {
    const config = parseRepoConfigContent(`
schema_version: 2
gate:
  mode: release-ready
thresholds:
  risk: 70
  warn: 55
contexts:
  - name: main
    match:
      base_branch: [main]
    ci:
      required_checks: [CI Gate, Playwright]
`)!;

    const findings = compareConfiguredChecks(collectConfiguredChecks(config), [
      "CI Gate",
      "Lint",
    ]);

    expect(
      findings.some(
        (f) => f.code === "unknown_check_name" && f.message.includes("Playwright"),
      ),
    ).toBe(true);
    expect(
      findings.some((f) => f.code === "unconfigured_check" && f.message.includes("Lint")),
    ).toBe(true);
  });

  it("matches check names case-insensitively and by prefix", () => {
    const findings = compareConfiguredChecks(["ci gate"], ["CI Gate / lint"]);
    expect(findings.filter((f) => f.code === "unknown_check_name")).toHaveLength(0);
  });

  it("flags threshold ordering issues", () => {
    const config = parseRepoConfigContent(`
schema_version: 2
gate:
  mode: release-ready
thresholds:
  risk: 60
  warn: 70
contexts:
  - name: main
    match:
      base_branch: [main]
    ci:
      required_checks: [CI Gate]
`)!;

    const findings = validateConfigStructure(config, ".trailhead.yml");
    expect(findings.some((f) => f.code === "threshold_order")).toBe(true);
  });
});

describe("runDoctor", () => {
  it("reports missing config as failure", async () => {
    const dir = makeTempDir();
    const report = await runDoctor({ cwd: dir, offline: true });
    expect(report.ok).toBe(false);
    expect(report.findings[0]?.code).toBe("config_missing");
  });

  it("passes offline validation for a valid config", async () => {
    const dir = makeTempDir();
    fs.copyFileSync(
      path.join(process.cwd(), "examples/policy-pack/trailhead-starter.main-only.v2.yml"),
      path.join(dir, ".trailhead.yml"),
    );

    const report = await runDoctor({ cwd: dir, offline: true });
    expect(report.configValid).toBe(true);
    expect(report.configuredChecks).toContain("CI Gate");
    expect(report.ok).toBe(true);
  });
});

describe("formatDoctorReport", () => {
  it("includes severity labels and result summary", () => {
    const text = formatDoctorReport({
      configPath: ".trailhead.yml",
      configValid: true,
      gateMode: "release-ready",
      expectedCheckName: "Trailhead — Release Ready",
      configuredChecks: ["Lint"],
      observedChecks: [],
      findings: [
        {
          severity: "warn",
          code: "unknown_check_name",
          message: 'Configured check "Lint" did not match any recent GitHub check run',
        },
      ],
      ok: true,
    });

    expect(text).toContain("WARN [unknown_check_name]");
    expect(text).toContain("Result: OK");
  });
});
