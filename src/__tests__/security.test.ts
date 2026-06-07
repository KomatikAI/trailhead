import { vi } from "vitest";

vi.mock("@actions/core", () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@actions/github", () => ({
  context: {
    repo: { owner: "test-org", repo: "test-repo" },
  },
  getOctokit: vi.fn(),
}));

import * as github from "@actions/github";
import {
  alertTouchesChangedFile,
  fetchCodeScanningAlerts,
  computeSecurityRiskFactor,
  formatSecuritySection,
  decideSecurityBlock,
} from "../security.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("decideSecurityBlock (GATE-3 2a)", () => {
  const counts = (critical: number, total: number) =>
    ({ critical, high: 0, medium: 0, low: 0, total, topRules: [] }) as never;

  it("block_on_critical blocks ONLY on critical alerts, not low/medium total", () => {
    // 3 non-critical alerts, block_on_critical on → must NOT block (the old total>0 bug)
    expect(decideSecurityBlock(counts(0, 3), { blockOnCritical: true })).toBe(false);
    expect(decideSecurityBlock(counts(1, 3), { blockOnCritical: true })).toBe(true);
  });
  it("require_security_clear blocks on ANY alert (clear-all semantics)", () => {
    expect(decideSecurityBlock(counts(0, 2), { requireSecurityClear: true })).toBe(true);
  });
  it("no policy / no alerts → no block", () => {
    expect(decideSecurityBlock(counts(5, 9), {})).toBe(false);
    expect(decideSecurityBlock(null, { blockOnCritical: true })).toBe(false);
  });
});

describe("alertTouchesChangedFile", () => {
  it("matches exact and suffix paths", () => {
    const alert = {
      number: 1,
      state: "open",
      rule: { id: "r", severity: "error", description: "d" },
      tool: { name: "CodeQL" },
      most_recent_instance: {
        ref: "main",
        state: "open",
        location: { path: "src/auth/login.ts", start_line: 1 },
      },
    };
    expect(alertTouchesChangedFile(alert, new Set(["src/auth/login.ts"]))).toBe(true);
    expect(alertTouchesChangedFile(alert, new Set(["docs/readme.md"]))).toBe(false);
  });
});

describe("fetchCodeScanningAlerts", () => {
  it("returns empty counts when API returns no alerts", async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({ data: [] }),
    };
    vi.mocked(github.getOctokit).mockReturnValue(
      octokit as unknown as ReturnType<typeof github.getOctokit>,
    );

    const result = await fetchCodeScanningAlerts("ghp_test");
    expect(result.total).toBe(0);
    expect(result.critical).toBe(0);
  });

  it("counts alerts by severity", async () => {
    const alerts = [
      {
        number: 1,
        state: "open",
        rule: {
          id: "js/xss",
          severity: "error",
          security_severity_level: "critical",
          description: "XSS vulnerability",
        },
        tool: { name: "CodeQL" },
        most_recent_instance: { ref: "main", state: "open" },
      },
      {
        number: 2,
        state: "open",
        rule: {
          id: "js/sql-injection",
          severity: "error",
          security_severity_level: "high",
          description: "SQL injection",
        },
        tool: { name: "CodeQL" },
        most_recent_instance: { ref: "main", state: "open" },
      },
      {
        number: 3,
        state: "open",
        rule: {
          id: "js/unused-var",
          severity: "warning",
          description: "Unused variable",
        },
        tool: { name: "CodeQL" },
        most_recent_instance: { ref: "main", state: "open" },
      },
    ];

    const octokit = {
      request: vi.fn().mockResolvedValue({ data: alerts }),
    };
    vi.mocked(github.getOctokit).mockReturnValue(
      octokit as unknown as ReturnType<typeof github.getOctokit>,
    );

    const result = await fetchCodeScanningAlerts("ghp_test");
    expect(result.total).toBe(3);
    expect(result.critical).toBe(1);
    expect(result.high).toBe(1);
    expect(result.medium).toBe(1);
  });

  it("respects ignore_rules config", async () => {
    const alerts = [
      {
        number: 1,
        state: "open",
        rule: {
          id: "js/xss",
          severity: "error",
          security_severity_level: "high",
          description: "XSS",
        },
        tool: { name: "CodeQL" },
        most_recent_instance: { ref: "main", state: "open" },
      },
      {
        number: 2,
        state: "open",
        rule: {
          id: "js/unused-var",
          severity: "warning",
          description: "Unused",
        },
        tool: { name: "CodeQL" },
        most_recent_instance: { ref: "main", state: "open" },
      },
    ];

    const octokit = {
      request: vi.fn().mockResolvedValue({ data: alerts }),
    };
    vi.mocked(github.getOctokit).mockReturnValue(
      octokit as unknown as ReturnType<typeof github.getOctokit>,
    );

    const result = await fetchCodeScanningAlerts("ghp_test", {
      severity_threshold: "warning",
      block_on_critical: true,
      ignore_rules: ["js/unused-var"],
    });
    expect(result.total).toBe(1);
    expect(result.high).toBe(1);
  });

  it("scopes alerts to PR changed files when changedFiles is set", async () => {
    const alerts = [
      {
        number: 1,
        state: "open",
        rule: {
          id: "js/xss",
          severity: "error",
          security_severity_level: "high",
          description: "XSS in src",
        },
        tool: { name: "CodeQL" },
        most_recent_instance: {
          ref: "main",
          state: "open",
          location: { path: "src/auth/login.ts", start_line: 10 },
        },
      },
      {
        number: 2,
        state: "open",
        rule: {
          id: "js/other",
          severity: "error",
          security_severity_level: "high",
          description: "Elsewhere",
        },
        tool: { name: "CodeQL" },
        most_recent_instance: {
          ref: "main",
          state: "open",
          location: { path: "lib/legacy/util.ts", start_line: 3 },
        },
      },
    ];

    const octokit = {
      request: vi.fn().mockResolvedValue({ data: alerts }),
    };
    vi.mocked(github.getOctokit).mockReturnValue(
      octokit as unknown as ReturnType<typeof github.getOctokit>,
    );

    const result = await fetchCodeScanningAlerts("ghp_test", undefined, {
      changedFiles: ["src/auth/login.ts"],
    });
    expect(result.total).toBe(1);
    expect(result.high).toBe(1);
    expect(result.topRules).toEqual(["js/xss (1)"]);
  });

  it("returns empty counts when changedFiles is an empty array", async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({
        data: [
          {
            number: 1,
            state: "open",
            rule: { id: "js/xss", severity: "error", description: "XSS" },
            tool: { name: "CodeQL" },
            most_recent_instance: {
              ref: "main",
              state: "open",
              location: { path: "src/x.ts", start_line: 1 },
            },
          },
        ],
      }),
    };
    vi.mocked(github.getOctokit).mockReturnValue(
      octokit as unknown as ReturnType<typeof github.getOctokit>,
    );

    const result = await fetchCodeScanningAlerts("ghp_test", undefined, {
      changedFiles: [],
    });
    expect(result.total).toBe(0);
    expect(octokit.request).not.toHaveBeenCalled();
  });

  it("handles 403/404 gracefully", async () => {
    const octokit = {
      request: vi.fn().mockRejectedValue(new Error("403 Forbidden")),
    };
    vi.mocked(github.getOctokit).mockReturnValue(
      octokit as unknown as ReturnType<typeof github.getOctokit>,
    );

    const result = await fetchCodeScanningAlerts("ghp_test");
    expect(result.total).toBe(0);
  });
});

describe("computeSecurityRiskFactor", () => {
  it("returns null for zero alerts", () => {
    const result = computeSecurityRiskFactor({
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      total: 0,
    });
    expect(result).toBeNull();
  });

  it("computes score from alert counts", () => {
    const result = computeSecurityRiskFactor({
      critical: 1,
      high: 2,
      medium: 3,
      low: 0,
      total: 6,
    });
    expect(result).not.toBeNull();
    expect(result?.type).toBe("security_alerts");
    expect(result?.score).toBe(75);
  });

  it("boosts score on critical with block_on_critical", () => {
    const result = computeSecurityRiskFactor(
      { critical: 1, high: 0, medium: 0, low: 0, total: 1 },
      { severity_threshold: "warning", block_on_critical: true, ignore_rules: [] },
    );
    expect(result?.score).toBe(90);
  });
});

describe("formatSecuritySection", () => {
  it("returns empty string for no alerts", () => {
    expect(
      formatSecuritySection({
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        total: 0,
      }),
    ).toBe("");
  });

  it("renders markdown table", () => {
    const section = formatSecuritySection({
      critical: 1,
      high: 2,
      medium: 3,
      low: 0,
      total: 6,
      topRules: ["js/xss (3)", "js/sql-injection (2)"],
    });

    expect(section).toContain("Security Alerts");
    expect(section).toContain("Critical");
    expect(section).toContain("High");
    expect(section).toContain("Medium");
    expect(section).toContain("**6**");
    expect(section).toContain("js/xss");
  });
});
