import type {
  CiCheck,
  CiSummary,
  GateDecision,
  GateEvaluation,
  GateMode,
} from "./types.js";

/**
 * ADR-011 §2: the disposition, once resolved, is the axis that decides whether a
 * red input blocks the release. Checks with no disposition — no `input_relevance`
 * config, an externally-built CiSummary, or a stored pre-ADR-011 evaluation —
 * fall back to `required`, which is byte-for-byte the pre-ADR-011 behavior
 * (the default mapping is required -> blocking, non-required -> advisory).
 */
export function checkCountsTowardBlocking(check: CiCheck): boolean {
  const kind = check.disposition?.kind;
  if (kind === undefined) return check.required;
  return kind === "blocking" || kind === "missing_blocking";
}

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
          checkCountsTowardBlocking(c) &&
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

  // health_score is WARN-ONLY (GATE-3): it no longer blocks release-readiness.
  // Rationale: across 1,500+ stored evaluations health_score barely discriminates
  // (release_ready true=88.1 vs false=81.8 → ~6pt = noise) while risk_score carries
  // the signal (44.2 vs 78.9 → ~35pt). A low health_score still surfaces as a `warn`
  // gate decision (see decideGate in risk-engine.ts: `healthScore < 50` → "warn"),
  // so the genuine-outage signal stays visible — it just doesn't flip releaseReady.

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
  // Availability is a separate contract from advisory/risk/release modes. A run
  // that evaluated NOTHING must never publish `success` — that is an auto-green
  // path: it would claim a passing verdict the run never reached, and any repo
  // that leaves `environment` unset defaults to fail-open. Fail-open publishes
  // `neutral`, which GitHub treats as satisfying a required check without
  // asserting the gate passed; fail-closed publishes `failure`.
  if (evaluation.releaseBrief?.verdict === "cannot_evaluate") {
    return evaluation.gateDecision === "allow" ? "neutral" : "failure";
  }

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
  if (configuredName) return configuredName;
  if (gateMode === "risk-only") return "Trailhead";
  return "Trailhead — Release Ready";
}
