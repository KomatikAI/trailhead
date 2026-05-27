export interface RolloutReadinessInput {
  gateDecision: "allow" | "warn" | "block";
  riskScore: number;
  healthScore: number;
  policyFindings?: string[];
  trust_profile?: { strictness: "baseline" | "elevated" | "strict" };
  escalation_status?: { enabled: boolean; target_count: number };
  releaseReady?: boolean;
  gateMode?: "release-ready" | "advisory" | "risk-only";
  ci?: { allRequiredPassed: boolean; failedCount: number; pendingCount: number };
}

export interface RolloutReadinessResult {
  ready: boolean;
  band: "go" | "review" | "hold";
  score: number;
  reasons: string[];
}

export function computeRolloutReadiness(
  evaluation: RolloutReadinessInput,
): RolloutReadinessResult {
  let score = Math.max(0, Math.min(100, 100 - evaluation.riskScore));
  const reasons: string[] = [];

  const mode = evaluation.gateMode ?? "risk-only";
  const ciFailed =
    evaluation.ci != null &&
    (!evaluation.ci.allRequiredPassed ||
      evaluation.ci.failedCount > 0 ||
      evaluation.ci.pendingCount > 0);

  if (mode === "release-ready" || mode === "advisory") {
    if (evaluation.releaseReady === false) {
      score -= 40;
      reasons.push("Release readiness check failed");
    }
    if (evaluation.ci && !evaluation.ci.allRequiredPassed) {
      score -= 25;
      reasons.push(`${evaluation.ci.failedCount} required CI check(s) failed or missing`);
    }
    if (evaluation.ci && evaluation.ci.pendingCount > 0) {
      score -= 15;
      reasons.push(`${evaluation.ci.pendingCount} CI check(s) still pending`);
    }
  }

  if (evaluation.gateDecision === "warn") {
    score -= 10;
    reasons.push("Gate decision is WARN");
  } else if (evaluation.gateDecision === "block") {
    score -= 30;
    reasons.push("Gate decision is BLOCK");
  }

  if (evaluation.healthScore < 50) {
    score -= 20;
    reasons.push("Health score below 50");
  }

  const strictness = evaluation.trust_profile?.strictness ?? "baseline";
  if (strictness === "elevated") {
    score -= 5;
    reasons.push("Elevated trust profile strictness");
  } else if (strictness === "strict") {
    score -= 10;
    reasons.push("Strict trust profile strictness");
  }

  const hasBlockingFinding = (evaluation.policyFindings ?? []).some((f) =>
    /(blocking pattern|requires|exceeds|detected)/i.test(f),
  );
  if (hasBlockingFinding) {
    score -= 10;
    reasons.push("Policy findings include blocking-style signals");
  }

  if (
    evaluation.escalation_status?.enabled &&
    evaluation.escalation_status.target_count > 0
  ) {
    score += 5;
    reasons.push("Escalation targets configured");
  }

  score = Math.max(0, Math.min(100, score));

  let band: RolloutReadinessResult["band"];
  if (mode !== "risk-only" && evaluation.releaseReady === false) {
    band = "hold";
  } else if (ciFailed) {
    band = evaluation.gateDecision === "block" || score < 45 ? "hold" : "review";
  } else if (evaluation.gateDecision === "allow" && score >= 70) {
    band = "go";
  } else if (evaluation.gateDecision !== "block" && score >= 45) {
    band = "review";
  } else {
    band = "hold";
  }

  return {
    ready: band === "go",
    band,
    score,
    reasons,
  };
}
