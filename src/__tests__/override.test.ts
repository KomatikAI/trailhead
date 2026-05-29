import { describe, it, expect } from "vitest";
import {
  hasOverrideLabel,
  parseOverrideComment,
  resolveLabelOverride,
  buildLabelOverrideAudit,
  formatOverrideRejectionMessage,
} from "../override.js";

describe("hasOverrideLabel", () => {
  it("matches trailhead-override case-insensitively", () => {
    expect(hasOverrideLabel(["Trailhead-Override"])).toBe(true);
    expect(hasOverrideLabel(["bug"])).toBe(false);
  });
});

describe("parseOverrideComment", () => {
  it("extracts the most recent valid override reason", () => {
    expect(
      parseOverrideComment([
        { body: "trailhead-override: first reason", author: "alice" },
        { body: "Looks good to me", author: "bob" },
        { body: "trailhead-override: latest reason", author: "carol" },
      ]),
    ).toEqual({
      reason: "latest reason",
      author: "carol",
    });
  });

  it("accepts leading whitespace on the override line", () => {
    expect(
      parseOverrideComment([
        {
          body: "  trailhead-override: emergency hotfix for prod outage",
          author: "david",
        },
      ]),
    ).toEqual({
      reason: "emergency hotfix for prod outage",
      author: "david",
    });
  });

  it("returns null when label comment is missing or empty", () => {
    expect(
      parseOverrideComment([{ body: "trailhead-override:", author: "alice" }]),
    ).toBeNull();
    expect(
      parseOverrideComment([{ body: "please override this", author: "alice" }]),
    ).toBeNull();
  });
});

describe("resolveLabelOverride", () => {
  const blockedRelease = {
    releaseReady: false,
    reasons: ["Risk/policy gate decision is BLOCK"],
  };

  it("applies override when label and reason are present", () => {
    const outcome = resolveLabelOverride({
      labels: ["trailhead-override"],
      comments: [{ body: "trailhead-override: approved by on-call", author: "david" }],
      config: { enabled: true, maxPerWeek: 5 },
      recentOverrideCount: 1,
      releaseResult: blockedRelease,
      gateDecision: "block",
      prNumber: 42,
    });

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") return;
    expect(outcome.audit.source).toBe("label");
    expect(outcome.audit.reason).toBe("approved by on-call");
    expect(outcome.audit.changes.releaseReady).toBe(true);
    expect(outcome.audit.preOverrideDecision).toBe("block");
  });

  it("rejects when reason comment is missing", () => {
    const outcome = resolveLabelOverride({
      labels: ["trailhead-override"],
      comments: [],
      config: { enabled: true, maxPerWeek: 5 },
      recentOverrideCount: 0,
      releaseResult: blockedRelease,
      gateDecision: "block",
      prNumber: 42,
    });

    expect(outcome).toEqual({
      kind: "rejected",
      code: "missing_reason",
      message: formatOverrideRejectionMessage("missing_reason"),
    });
  });

  it("rejects when weekly cap is exceeded", () => {
    const outcome = resolveLabelOverride({
      labels: ["trailhead-override"],
      comments: [{ body: "trailhead-override: one more", author: "david" }],
      config: { enabled: true, maxPerWeek: 5 },
      recentOverrideCount: 5,
      releaseResult: blockedRelease,
      gateDecision: "block",
      prNumber: 42,
    });

    expect(outcome.kind).toBe("rejected");
    if (outcome.kind !== "rejected") return;
    expect(outcome.code).toBe("cap_exceeded");
  });

  it("no-ops when release is already ready", () => {
    const outcome = resolveLabelOverride({
      labels: ["trailhead-override"],
      comments: [{ body: "trailhead-override: unnecessary", author: "david" }],
      config: { enabled: true, maxPerWeek: 5 },
      recentOverrideCount: 0,
      releaseResult: { releaseReady: true, reasons: [] },
      gateDecision: "allow",
      prNumber: 42,
    });

    expect(outcome).toEqual({ kind: "none" });
  });
});

describe("buildLabelOverrideAudit", () => {
  it("captures pre-override state for audit trail", () => {
    const audit = buildLabelOverrideAudit({
      parsed: { reason: "hotfix", author: "david" },
      prNumber: 99,
      releaseResult: { releaseReady: false, reasons: ["CI failed"] },
      gateDecision: "block",
    });

    expect(audit.owner).toBe("david");
    expect(audit.linkedTicket).toBe("override:pr#99");
    expect(audit.preOverrideReleaseReady).toBe(false);
    expect(audit.preOverrideReasons).toEqual(["CI failed"]);
  });
});
