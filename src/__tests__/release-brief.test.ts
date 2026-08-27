import { describe, expect, it } from "vitest";
import { renderReleaseBrief } from "../release-brief.js";
import type { BriefFinding, BriefInput, ReleaseBrief } from "../release-brief.js";

function brief(overrides: Partial<ReleaseBrief> = {}): ReleaseBrief {
  return {
    verdict: "allow",
    findings: [],
    inputs: [],
    actions: [],
    ...overrides,
  };
}

function finding(overrides: Partial<BriefFinding> = {}): BriefFinding {
  return {
    id: "ci_integrity.bypass",
    title: "Workflow bypass pattern introduced",
    evidence: '.github/workflows/ci.yml: workflow bypass pattern "|| true"',
    severity: "blocking",
    ...overrides,
  };
}

function input(overrides: Partial<BriefInput> = {}): BriefInput {
  return {
    checkName: "CI Gate",
    status: "pass",
    disposition: "blocking",
    ...overrides,
  };
}

describe("renderReleaseBrief — verdict shapes", () => {
  it("renders an allow brief with no findings", () => {
    const output = renderReleaseBrief(
      brief({
        verdict: "allow",
        riskScore: 12,
        riskThreshold: 70,
        inputs: [input()],
      }),
    );

    expect(output).toContain("## Release Brief");
    expect(output).toContain("**ALLOW** — risk 12 (threshold 70)");
    expect(output).toContain("No findings.");
    expect(output).toContain("| CI Gate | pass | blocking | — |");
    expect(output).toContain("No actions.");
    expect(output).not.toContain("### Override");
    expect(output).not.toContain("Cannot evaluate");
  });

  it("renders a warn brief with top movers, delta and actions", () => {
    const output = renderReleaseBrief(
      brief({
        verdict: "warn",
        riskScore: 55,
        riskThreshold: 70,
        topMovers: [
          { factor: "churn", score: 25 },
          { factor: "sensitivity", score: 15 },
        ],
        findings: [finding({ severity: "warn", id: "churn.large" })],
        inputs: [input()],
        delta: "risk 40 → 55 since the previous evaluation; 1 new finding",
        actions: [
          { kind: "fix", detail: "Split the PR", link: "https://example.test/split" },
          { kind: "wait", detail: "Pending checks are still running" },
        ],
      }),
    );

    expect(output).toContain(
      "**WARN** — risk 55 (threshold 70) · top movers: churn 25, sensitivity 15",
    );
    expect(output).toContain("**Delta:** risk 40 → 55 since the previous evaluation");
    expect(output).toContain(
      "- **fix:** Split the PR ([link](https://example.test/split))",
    );
    expect(output).toContain("- **wait:** Pending checks are still running");
    expect(output).not.toContain("**wait:** Pending checks are still running (");
  });

  it("renders a block brief enumerating every finding, never a bare count", () => {
    const findings = [
      finding({ id: "ci_integrity.bypass", title: "Bypass pattern" }),
      finding({
        id: "ci_integrity.continue_on_error",
        title: "continue-on-error introduced",
        evidence: '.github/workflows/deploy.yml: introduced "continue-on-error: true"',
      }),
      finding({
        id: "supply_chain.unpinned",
        title: "Unpinned action",
        evidence: undefined,
        severity: "advisory",
      }),
    ];

    const output = renderReleaseBrief(
      brief({
        verdict: "block",
        riskScore: 90,
        riskThreshold: 70,
        topMovers: [{ factor: "ci_integrity", score: 40 }],
        findings,
        inputs: [input()],
      }),
    );

    expect(output).toContain(
      "**BLOCK** — risk 90 (threshold 70) · top movers: ci_integrity 40",
    );
    expect(output).toContain("1. **Bypass pattern** `ci_integrity.bypass` _(blocking)_");
    expect(output).toContain(
      "2. **continue-on-error introduced** `ci_integrity.continue_on_error` _(blocking)_",
    );
    expect(output).toContain(
      "3. **Unpinned action** `supply_chain.unpinned` _(advisory)_",
    );
    expect(output).toContain("   > .github/workflows/deploy.yml");
    // The Case A bug: a count standing in for the items.
    expect(output).not.toMatch(/blocking patterns detected \(\d+\)/);
    expect(output).not.toContain("more findings not shown inline");
  });

  it("renders a cannot_evaluate brief with the reason prominent plus inputs and actions", () => {
    const output = renderReleaseBrief(
      brief({
        verdict: "cannot_evaluate",
        cannotEvaluateReason: "evaluation store unreachable (HTTP 503)",
        inputs: [input({ status: "pending", disposition: "blocking" })],
        actions: [{ kind: "wait", detail: "Re-run once the store responds" }],
      }),
    );

    const lines = output.split("\n");
    expect(lines[0]).toBe("## Release Brief");
    expect(lines[2]).toBe("**CANNOT EVALUATE**");
    expect(lines[4]).toBe(
      "> ⚠️ **Cannot evaluate:** evaluation store unreachable (HTTP 503)",
    );
    expect(output).toContain("| CI Gate | pending | blocking | — |");
    expect(output).toContain("- **wait:** Re-run once the store responds");
  });

  it("states the omission when a cannot_evaluate brief carries no reason", () => {
    const output = renderReleaseBrief(brief({ verdict: "cannot_evaluate" }));
    expect(output).toContain("> ⚠️ **Cannot evaluate:** no reason recorded");
  });

  it("renders the override block and normalises a leading @", () => {
    const output = renderReleaseBrief(
      brief({
        verdict: "block",
        findings: [finding()],
        override: {
          by: "@david",
          at: "2026-08-09T22:14:00Z",
          scope: "risk_only",
          rationale: "keystone-verified promotion train",
        },
      }),
    );

    expect(output).toContain("### Override");
    expect(output).toContain(
      "> Overridden by @david at 2026-08-09T22:14:00Z, scope risk_only — keystone-verified promotion train",
    );
  });

  it("omits the override block when override is null", () => {
    const output = renderReleaseBrief(brief({ override: null }));
    expect(output).not.toContain("### Override");
  });

  it("renders an override trace that could not be honored", () => {
    const output = renderReleaseBrief(
      brief({
        overrideStatus: {
          status: "rejected",
          source: "live",
          message:
            "A reason comment is present but the trailhead-override label is missing. Add it.",
        },
      }),
    );

    expect(output).toContain(
      "> ⚠️ **Override rejected:** A reason comment is present but the trailhead-override label is missing. Add it. _(state source: live)_",
    );
  });

  it("renders legacy override feedback without inventing a live source", () => {
    const output = renderReleaseBrief(
      brief({
        overrideStatus: {
          status: "rejected",
          message: "Historical feedback",
        },
      }),
    );

    expect(output).toContain("> ⚠️ **Override rejected:** Historical feedback");
    expect(output).not.toContain("state source:");
  });

  it.each([
    { published: true, reportRefreshed: true, label: "✅", state: "published" },
    {
      published: true,
      reportRefreshed: false,
      label: "⚠️",
      state: "published, report stale",
    },
    {
      published: false,
      reportRefreshed: false,
      label: "⚠️",
      state: "not published",
    },
  ])(
    "renders required-check publication: $state",
    ({ published, reportRefreshed, label, state }) => {
      const output = renderReleaseBrief(
        brief({
          requiredCheck: {
            published,
            reportRefreshed,
            name: "Trailhead — Release Ready",
            headSha: "abc123",
            eventName: "pull_request_review",
            message: published
              ? "Published the custom check on the PR head."
              : "Publishing failed; trigger pull_request:labeled after recovery.",
          },
        }),
      );

      expect(output).toContain(`> ${label} **Required check ${state}:**`);
      expect(output).toContain(
        published
          ? "Published the custom check on the PR head."
          : "trigger pull_request:labeled after recovery.",
      );
    },
  );
});

describe("renderReleaseBrief — empty and partial data", () => {
  it("renders a fully empty brief without dropping required sections", () => {
    const output = renderReleaseBrief(brief());

    expect(output).toContain("**ALLOW**");
    expect(output).toContain("### Findings");
    expect(output).toContain("No findings.");
    expect(output).toContain("### Inputs");
    expect(output).toContain("No inputs evaluated.");
    expect(output).toContain("### Actions");
    expect(output).toContain("No actions.");
    expect(output).not.toContain("**Delta:**");
    expect(output.endsWith("\n")).toBe(false);
  });

  it("renders every input row including passes and skips", () => {
    const output = renderReleaseBrief(
      brief({
        inputs: [
          input({ checkName: "type-check", status: "pass", disposition: "blocking" }),
          input({ checkName: "Playwright", status: "skip", disposition: "advisory" }),
          input({
            checkName: "Deploy Edge Functions",
            status: "fail",
            disposition: "irrelevant",
            reason: "staging target unconfigured by design",
          }),
        ],
      }),
    );

    expect(output).toContain("| type-check | pass | blocking | — |");
    expect(output).toContain("| Playwright | skip | advisory | — |");
    expect(output).toContain(
      "| Deploy Edge Functions | fail | irrelevant | staging target unconfigured by design |",
    );
  });

  it("renders risk alone and threshold alone", () => {
    expect(renderReleaseBrief(brief({ riskScore: 30 }))).toContain("**ALLOW** — risk 30");
    expect(renderReleaseBrief(brief({ riskThreshold: 70 }))).toContain(
      "**ALLOW** — threshold 70",
    );
    expect(renderReleaseBrief(brief({ topMovers: [] }))).toContain("**ALLOW**\n");
  });

  it("ignores a whitespace-only delta", () => {
    expect(renderReleaseBrief(brief({ delta: "   " }))).not.toContain("**Delta:**");
  });

  it("renders multi-line evidence as multiple quoted lines", () => {
    const output = renderReleaseBrief(
      brief({
        verdict: "block",
        findings: [finding({ evidence: "first line\nsecond line" })],
      }),
    );

    expect(output).toContain("   > first line\n   > second line");
  });
});

describe("renderReleaseBrief — truncation", () => {
  function manyFindings(count: number): BriefFinding[] {
    return Array.from({ length: count }, (_, index) =>
      finding({
        id: `finding.${index}`,
        title: `Finding number ${index}`,
        evidence: `evidence body ${index} `.repeat(20),
      }),
    );
  }

  it("does not truncate a normal brief under the 60000 default", () => {
    const output = renderReleaseBrief(
      brief({ verdict: "block", findings: manyFindings(5), inputs: [input()] }),
    );

    expect(output.length).toBeLessThanOrEqual(60000);
    expect(output).toContain("Finding number 4");
    expect(output).not.toContain("more findings not shown inline");
  });

  it("drops findings from the end and appends the more-findings notice", () => {
    const maxChars = 1200;
    const output = renderReleaseBrief(
      brief({ verdict: "block", findings: manyFindings(40), inputs: [input()] }),
      { maxChars },
    );

    expect(output.length).toBeLessThanOrEqual(maxChars);
    expect(output).toContain("1. **Finding number 0**");
    expect(output).not.toContain("39. **Finding number 39**");
    expect(output).toMatch(
      /_…\d+ more findings not shown inline — see the stored evaluation_/,
    );
    expect(output).toContain("### Inputs");
  });

  it("links the stored evaluation in the notice when a url is given", () => {
    const output = renderReleaseBrief(
      brief({ verdict: "block", findings: manyFindings(40) }),
      { maxChars: 1200, storedEvaluationUrl: "https://example.test/eval/9" },
    );

    expect(output.length).toBeLessThanOrEqual(1200);
    expect(output).toContain(
      "more findings not shown inline — see the [stored evaluation](https://example.test/eval/9)",
    );
  });

  it("keeps at least one finding and caps evidence when a single finding is oversized", () => {
    const output = renderReleaseBrief(
      brief({
        verdict: "block",
        findings: [finding({ title: "Huge", evidence: "x".repeat(5000) })],
        inputs: [input()],
      }),
      { maxChars: 900 },
    );

    expect(output.length).toBeLessThanOrEqual(900);
    expect(output).toContain("1. **Huge**");
    const evidenceLine = output.split("\n").find((line) => line.startsWith("   > x"));
    expect(evidenceLine).toBeDefined();
    // 300-char cap, ellipsis included, plus the "   > " prefix.
    expect(evidenceLine?.length).toBe(305);
    expect(evidenceLine?.endsWith("…")).toBe(true);
  });

  it("never exceeds maxChars even when nothing structural can be dropped", () => {
    for (const maxChars of [1, 12, 40, 120]) {
      const output = renderReleaseBrief(
        brief({
          verdict: "block",
          findings: manyFindings(10),
          inputs: [input(), input({ checkName: "Lint" })],
          actions: [{ kind: "fix", detail: "do the thing" }],
        }),
        { maxChars },
      );
      expect(output.length).toBeLessThanOrEqual(maxChars);
    }
  });

  it("hard-clips a findingless brief whose inputs alone overflow", () => {
    const inputs = Array.from({ length: 50 }, (_, index) =>
      input({ checkName: `check-${index}`, reason: `reason ${index}`.repeat(10) }),
    );
    const output = renderReleaseBrief(brief({ inputs }), { maxChars: 300 });

    expect(output.length).toBeLessThanOrEqual(300);
    expect(output).toContain("## Release Brief");
  });

  it("returns an empty string for a non-positive maxChars", () => {
    expect(renderReleaseBrief(brief({ findings: [finding()] }), { maxChars: 0 })).toBe(
      "",
    );
    expect(renderReleaseBrief(brief(), { maxChars: -5 })).toBe("");
  });

  it("falls back to the default when maxChars is not finite", () => {
    const output = renderReleaseBrief(brief({ findings: manyFindings(3) }), {
      maxChars: Number.NaN,
    });
    expect(output).toContain("Finding number 2");
  });
});

describe("renderReleaseBrief — escaping", () => {
  it("escapes pipes in check names, statuses, dispositions and reasons", () => {
    const output = renderReleaseBrief(
      brief({
        inputs: [
          input({
            checkName: "build | linux",
            status: "fail",
            disposition: "irrelevant",
            reason: "matrix leg a|b is not run on this pair",
          }),
        ],
      }),
    );

    expect(output).toContain(
      "| build \\| linux | fail | irrelevant | matrix leg a\\|b is not run on this pair |",
    );
    const row = output.split("\n").find((line) => line.startsWith("| build"));
    // Escaped pipes must not add columns: 4 cells => 5 unescaped delimiters.
    expect(row?.replace(/\\\|/g, "")?.split("|").length).toBe(6);
  });

  it("escapes backslashes so a trailing \\ cannot neutralize a pipe escape", () => {
    const output = renderReleaseBrief(
      brief({
        inputs: [
          input({
            checkName: "build \\| windows",
            status: "fail",
            disposition: "blocking",
            reason: "path C:\\ci\\logs|latest",
          }),
        ],
      }),
    );

    const row = output.split("\n").find((line) => line.startsWith("| build"));
    expect(row).toContain("build \\\\\\| windows");
    expect(row).toContain("C:\\\\ci\\\\logs\\|latest");
    // With backslashes escaped, no raw "\|" can survive to swallow a delimiter:
    // 4 cells => 5 unescaped delimiters.
    expect(row?.replace(/\\./g, "")?.split("|").length).toBe(6);
  });

  it("escapes pipes in finding titles and evidence", () => {
    const output = renderReleaseBrief(
      brief({
        verdict: "block",
        findings: [
          finding({
            title: "bypass a|b",
            evidence: "ci.yml: `npm test || true` piped through a | b",
          }),
        ],
      }),
    );

    expect(output).toContain("1. **bypass a\\|b** `ci_integrity.bypass` _(blocking)_");
    expect(output).toContain("   > ci.yml: `npm test \\|\\| true` piped through a \\| b");
  });

  it("flattens newlines inside table cells", () => {
    const output = renderReleaseBrief(
      brief({
        inputs: [input({ reason: "line one\nline two" })],
      }),
    );

    expect(output).toContain("| CI Gate | pass | blocking | line one line two |");
  });
});
