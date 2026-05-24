import type { CiSummary, GateDecision, GateEvaluation, GateMode } from "./types.js";

export interface ReleaseReadyInput {
  gateMode: GateMode;
  gateDecision: GateDecision;
  riskScore: number;
  riskThreshold: number;
  healthScore: number;
  healthChecksConfigured: boolean;
  ciSummary?: CiSummary | null;
  freezeActive: boolean;
  freezeMessage?: string;
  policyFindings?: string[];
  requireSecurityClear?: boolean;
  securityBlocked?: boolean;
}

export interface ReleaseReadyResult {
  releaseReady: boolean;
  reasons: string[];
}

/**
 * Composite release readiness decision (ADR-006).
 */
export function computeReleaseReady(input: ReleaseReadyInput): ReleaseReadyResult {
  const reasons: string[] = [];

  if (input.gateMode === "risk-only") {
    if (input.gateDecision === "block") {
      reasons.push("Risk/policy gate decision is BLOCK");
    } else if (input.gateDecision === "warn") {
      reasons.push("Risk/policy gate decision is WARN (non-blocking in risk-only mode)");
    }
    return {
      releaseReady: input.gateDecision !== "block",
      reasons,
    };
  }

  if (input.ciSummary) {
    if (!input.ciSummary.allRequiredPassed) {
      const failed = input.ciSummary.checks.filter(
        (c) =>
          c.required &&
          (c.status === "fail" || c.status === "missing" || c.status === "stale"),
      );
      for (const check of failed) {
        reasons.push(
          `Required CI check "${check.name}" is ${check.status.toUpperCase()}`,
        );
      }
    }
    if (input.ciSummary.pendingCount > 0) {
      reasons.push(`${input.ciSummary.pendingCount} required CI check(s) still pending`);
    }
  }

  if (input.gateDecision === "block") {
    reasons.push("Risk/policy gate decision is BLOCK");
  }

  if (input.riskScore > input.riskThreshold) {
    reasons.push(
      `Risk score ${input.riskScore} exceeds threshold ${input.riskThreshold}`,
    );
  }

  if (input.freezeActive) {
    reasons.push(
      `Release freeze active${input.freezeMessage ? `: ${input.freezeMessage}` : ""}`,
    );
  }

  if (input.healthChecksConfigured && input.healthScore < 50) {
    reasons.push(`Health score ${input.healthScore} below minimum (50)`);
  }

  if (input.requireSecurityClear && input.securityBlocked) {
    reasons.push("Security gate requires clearance — blocking alerts present");
  }

  const blockingFindings = (input.policyFindings ?? []).filter((f) =>
    /blocking|requires|exceeds|configured to block/i.test(f),
  );
  if (blockingFindings.length > 0 && input.gateDecision === "block") {
    for (const finding of blockingFindings.slice(0, 3)) {
      if (!reasons.includes(finding)) reasons.push(finding);
    }
  }

  const releaseReady = reasons.length === 0;

  return { releaseReady, reasons };
}

export function applyReleaseReadyToEvaluation(
  evaluation: GateEvaluation,
  result: ReleaseReadyResult,
  gateMode: GateMode,
): GateEvaluation {
  return {
    ...evaluation,
    releaseReady: result.releaseReady,
    releaseReadyReasons: result.reasons.length > 0 ? result.reasons : undefined,
    gateMode,
  };
}

export function checkConclusionForEvaluation(
  evaluation: GateEvaluation,
): "success" | "neutral" | "failure" {
  const mode = evaluation.gateMode ?? "risk-only";

  if (mode === "advisory") {
    return "neutral";
  }

  if (mode === "release-ready") {
    return evaluation.releaseReady ? "success" : "failure";
  }

  switch (evaluation.gateDecision) {
    case "allow":
      return "success";
    case "warn":
      return "neutral";
    case "block":
      return "failure";
    default: {
      const _exhaustive: never = evaluation.gateDecision;
      return "failure";
    }
  }
}

export function shouldBlockMerge(evaluation: GateEvaluation): boolean {
  const mode = evaluation.gateMode ?? "risk-only";

  if (mode === "advisory") return false;
  if (mode === "release-ready") return evaluation.releaseReady === false;
  return evaluation.gateDecision === "block";
}

export function resolveCheckName(gateMode: GateMode, configuredName?: string): string {
  if (gateMode === "risk-only") return "Trailhead";
  return configuredName ?? "Trailhead — Release Ready";
}
