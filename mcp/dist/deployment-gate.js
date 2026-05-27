import { computeRiskScore, decideGate } from "./risk-engine.js";
import { computeReleaseReady } from "./release-ready.js";
export function evaluateDeploymentGate(input) {
    const { score, factors } = computeRiskScore(input.files);
    const gateDecision = decideGate(score, 100, input.riskThreshold, input.warnThreshold);
    const factorSummary = factors.length > 0
        ? factors
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map((f) => `${f.type.replace(/_/g, " ")}: ${f.score}/100`)
            .join(", ")
        : "No risk factors";
    const release = computeReleaseReady({
        gateMode: input.gateMode,
        gateDecision,
        riskScore: score,
        riskThreshold: input.riskThreshold,
        healthScore: 100,
        healthChecksConfigured: false,
        ciSummary: input.ciSummary ?? null,
        freezeActive: input.freezeActive ?? false,
        freezeMessage: input.freezeMessage,
    });
    const approved = input.gateMode === "advisory"
        ? true
        : input.gateMode === "release-ready"
            ? release.releaseReady
            : gateDecision !== "block";
    const contextLabel = input.context?.name ? ` · context **${input.context.name}**` : "";
    const ciLines = input.ciSummary && input.ciSummary.checks.length > 0
        ? `\n\n**CI:** ${input.ciSummary.checks
            .filter((c) => c.required)
            .map((c) => `${c.name}=${c.status}`)
            .join(", ") || "none configured"}`
        : "";
    let comment;
    if (input.gateMode === "release-ready") {
        if (approved) {
            comment =
                `**Trailhead — RELEASE READY** for \`${input.environment}\`${contextLabel}\n\n` +
                    `Risk **${score}/100** (threshold ${input.riskThreshold}) for ${input.prRef}.\n\n` +
                    `**Top factors:** ${factorSummary}${ciLines}`;
        }
        else {
            comment =
                `**Trailhead — NOT RELEASE READY** for \`${input.environment}\`${contextLabel}\n\n` +
                    `Risk **${score}/100** (threshold ${input.riskThreshold}) for ${input.prRef}.\n\n` +
                    `**Blockers:**\n${release.reasons.map((r) => `- ${r}`).join("\n")}\n\n` +
                    `**Top factors:** ${factorSummary}${ciLines}`;
        }
    }
    else if (gateDecision === "block") {
        comment =
            `**Trailhead: BLOCKED** deployment to \`${input.environment}\`\n\n` +
                `Risk score **${score}/100** exceeds threshold (${input.riskThreshold}) for ${input.prRef}.\n\n` +
                `**Top factors:** ${factorSummary}`;
    }
    else if (gateDecision === "warn") {
        comment =
            `**Trailhead: WARNING** — approving deployment to \`${input.environment}\` with elevated risk.\n\n` +
                `Risk score **${score}/100** (warn threshold: ${input.warnThreshold}) for ${input.prRef}.\n\n` +
                `**Top factors:** ${factorSummary}`;
    }
    else {
        comment =
            `**Trailhead: APPROVED** deployment to \`${input.environment}\`\n\n` +
                `Risk score **${score}/100** for ${input.prRef}. ${factorSummary}`;
    }
    return {
        gateDecision,
        riskScore: score,
        releaseReady: release.releaseReady,
        releaseReadyReasons: release.reasons,
        approved,
        comment,
        factorSummary,
    };
}
