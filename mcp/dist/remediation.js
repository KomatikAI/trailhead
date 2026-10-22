// Pure remediation derivation — no framework dependencies.
// Maps gate findings (risk factors, CI failures, policy violations, release-ready
// reasons) into a machine-readable Remediation block that agents can act on.
//
// Shared across the GitHub Action, MCP server, and GitHub App via the existing
// prebuild copy pattern. Keep this module free of @actions/*, octokit, and Node
// runtime imports so it stays portable.
//
// `trailhead.remediation.v1` is a consumed contract: fix codes are additive and
// an existing code never changes meaning. Two rules the derivations below keep:
// a fix's severity is the severity of the thing it describes (never the gate
// decision that happens to surround it), and whatever actually produced the
// verdict has a fix of its own — a block with no matching fix is the defect
// ADR-011 §1 calls silence.
import { RemediationFix as RemediationFixSchema } from "./types.js";
import { resolveLoopRound } from "./loop-bookkeeping.js";
import { deriveSubmissionFixes } from "./submission-remediation.js";
import { computeNextAction } from "./remediation-lanes.js";
export { RED_LANE_FIX_CODES, ROUTINE_FIX_CODES, classifyFixLane, hasRedLaneFindings, isAgentProvenanceType, computeNextAction, } from "./remediation-lanes.js";
const SUGGESTED_TEST_COMMAND = "npm test -- --run";
const SUGGESTED_LINT_COMMAND = "npm run lint -- --fix";
const SUGGESTED_FORMAT_COMMAND = "npm run format";
const factorCues = {
    test_coverage: {
        triggerScore: 60,
        advisoryScore: 30,
        build: (factor) => {
            const missing = factor.detail?.missing_tests ?? [];
            const filesText = missing.length
                ? missing.slice(0, 5).join(", ") + (missing.length > 5 ? ", …" : "")
                : "source files in this PR";
            return {
                code: "risk.test_coverage",
                title: "Test coverage missing for changed source",
                detail: `Source changes lack matching test coverage in ${filesText}. Add tests that exercise the added or modified exports, then re-run the gate.`,
                files: missing,
                suggested_action: "Add a test file (or extend an existing one) covering the modified exports.",
                suggested_command: SUGGESTED_TEST_COMMAND,
                autofix_eligible: missing.length > 0,
                autofix_class: "test-scaffold",
            };
        },
    },
    sensitive_files: {
        triggerScore: 50,
        advisoryScore: 25,
        build: (factor) => {
            const touched = factor.detail?.files ?? [];
            return {
                code: "risk.sensitive_files",
                severity: "warn",
                title: "Sensitive files modified",
                detail: `This PR touches paths flagged as sensitive: ${touched.slice(0, 8).join(", ")}. These require a CODEOWNER review before merge.`,
                files: touched,
                suggested_action: "Request review from a CODEOWNER for the touched paths, or split sensitive changes into a dedicated PR.",
                autofix_eligible: false,
            };
        },
    },
    ci_integrity: {
        triggerScore: 40,
        build: (factor) => {
            const reasons = factor.detail?.reasons ?? [];
            return {
                code: "policy.ci_integrity",
                title: "CI confidence downgrade detected",
                detail: `Trailhead detected a CI confidence change: ${reasons.join("; ") || "tests deleted, coverage reduced, or workflow weakened"}. Restore the removed signal or justify the change in the PR description.`,
                suggested_action: "Restore deleted tests, undo the workflow change, or add a justification comment.",
                autofix_eligible: false,
            };
        },
    },
    workflow_security: {
        triggerScore: 40,
        build: (factor) => {
            const violations = factor.detail?.violations ?? [];
            return {
                code: "policy.workflow_security",
                title: "Workflow security violation",
                detail: `Detected unsafe GitHub Actions usage: ${violations.join("; ") || "unpinned action, write permissions, or untrusted PR runner"}. Pin to SHA or remove the change.`,
                files: violations.filter((v) => v.includes("/")),
                suggested_action: "Pin all third-party actions to commit SHAs; reduce permissions to least privilege.",
                autofix_eligible: false,
            };
        },
    },
    prompt_injection_risk: {
        triggerScore: 40,
        build: (factor) => {
            const sources = factor.detail?.sources ?? [];
            return {
                code: "policy.prompt_injection",
                title: "Potential prompt injection sink",
                detail: `Untrusted input flows into an LLM call without sanitisation in ${sources.join(", ") || "the changed files"}. Wrap inputs in sanitizeForPrompt() or an equivalent guard.`,
                files: sources,
                suggested_action: "Pass user-controlled strings through a sanitiser before they reach any LLM prompt.",
                autofix_eligible: false,
            };
        },
    },
    pr_scope: {
        triggerScore: 50,
        advisoryScore: 20,
        build: (factor) => {
            const files = factor.detail?.fileCount ??
                factor.detail?.file_count ??
                0;
            const changes = factor.detail?.totalChanges ??
                factor.detail?.line_count ??
                0;
            return {
                code: "policy.pr_scope",
                severity: "warn",
                title: "PR scope larger than recommended",
                detail: `This PR changes ${files} files / ${changes} lines, above the configured budget. Split into smaller PRs grouped by intent (e.g. one PR for refactor, one for feature).`,
                suggested_action: "Split this PR into 2–3 smaller PRs grouped by intent.",
                autofix_eligible: false,
            };
        },
    },
    duplicate_logic: {
        triggerScore: 40,
        build: (factor) => {
            const matches = factor.detail?.matches ?? [];
            return {
                code: "policy.duplicate_logic",
                severity: "warn",
                title: "Duplicate logic detected",
                detail: `Added code overlaps with existing implementations: ${matches.slice(0, 5).join(", ")}. Reuse the existing utility instead of re-implementing.`,
                files: matches,
                suggested_action: "Import the existing utility instead of re-implementing.",
                autofix_eligible: true,
                autofix_class: "import-fix",
            };
        },
    },
    security_alerts: {
        triggerScore: 40,
        build: (factor) => {
            const topRules = factor.detail?.topRules ?? [];
            return {
                code: "security.code_scanning",
                title: "Code scanning alerts on changed code",
                detail: `Code scanning surfaced alerts on touched files${topRules.length ? `: ${topRules.join(", ")}` : ""}. Address the alerts or document an exception.`,
                suggested_action: "Open the Security tab on the PR, resolve or dismiss alerts with justification.",
                autofix_eligible: false,
            };
        },
    },
    supply_chain: {
        triggerScore: 60,
        build: (factor) => {
            const packages = factor.detail?.packages ?? [];
            return {
                code: "risk.supply_chain",
                title: "Supply chain risk on dependency change",
                detail: `New or updated dependencies scored high on supply-chain risk: ${packages.join(", ")}. Verify provenance, pin versions, and document the change.`,
                files: ["package.json", "package-lock.json"],
                suggested_action: "Pin to known-good versions; add to allowlist if intentional.",
                autofix_eligible: false,
            };
        },
    },
};
function deriveCiFixes(ci) {
    if (!ci)
        return [];
    const fixes = [];
    const failed = ci.checks.filter((c) => c.status === "fail");
    if (failed.length > 0) {
        fixes.push(RemediationFixSchema.parse({
            code: "ci.failed",
            severity: "blocking",
            title: `${failed.length} required check${failed.length === 1 ? "" : "s"} failing`,
            detail: `Failing checks: ${failed.map((c) => c.name).join(", ")}. Open the linked run, fix the underlying issue, and push a new commit.`,
            suggested_action: "Re-run the failing checks locally; fix the underlying issue before pushing.",
            suggested_command: SUGGESTED_TEST_COMMAND,
        }));
    }
    const missing = ci.checks.filter((c) => c.status === "missing" && c.required);
    if (missing.length > 0) {
        fixes.push(RemediationFixSchema.parse({
            code: "ci.missing",
            severity: "blocking",
            title: `${missing.length} required check${missing.length === 1 ? "" : "s"} not reported`,
            detail: `Required checks did not run: ${missing.map((c) => c.name).join(", ")}. Verify the workflow triggers on this PR and that required jobs are configured.`,
        }));
    }
    return fixes;
}
const SEVERITY_RANK = {
    blocking: 3,
    warn: 2,
    advisory: 1,
};
const SEVERITY_TIERS = ["blocking", "warn", "advisory"];
/** Canonical policy-finding code — kept for the highest tier present, so existing
 * consumers of `policy.finding` keep seeing the findings that carry the verdict.
 * Lower tiers get a severity-suffixed code (`policy.finding.warn`,
 * `policy.finding.advisory`) because fixes are deduplicated by code. */
const POLICY_FINDING_CODE = "policy.finding";
/**
 * ADR-011 §1: enumerate, never count. The title carries the finding titles
 * themselves; the detail carries the full enumeration.
 */
function policyFindingTitle(titles) {
    const label = titles.length === 1 ? "Policy finding" : "Policy findings";
    const shown = titles.slice(0, 3);
    return `${label}: ${shown.join("; ")}${titles.length > shown.length ? "; …" : ""}`;
}
function enumeratedFindingLine(finding) {
    const evidence = finding.evidence ? ` — ${finding.evidence}` : "";
    return `- \`${finding.id}\` ${finding.title}${evidence}`;
}
/**
 * Policy findings, at their real severity.
 *
 * The gate decision is a property of the evaluation, not of any one finding:
 * deriving each fix's severity from it promoted warn-level change notices (e.g.
 * "Agent PR risk threshold tightened from 70 to 50") to `blocking`, telling
 * consuming agents to fix something no code change can fix. When the evaluation
 * carries `enumeratedFindings` (ADR-011 §1) those per-finding severities win and
 * the gate decision is ignored; one fix is emitted per severity tier present.
 * Without them there is no per-finding signal, so the legacy gate-derived
 * severity stands.
 */
function derivePolicyFindingFixes(input) {
    const enumerated = input.enumeratedFindings ?? [];
    if (enumerated.length > 0) {
        const tiers = SEVERITY_TIERS.map((severity) => ({
            severity,
            findings: enumerated.filter((finding) => finding.severity === severity),
        })).filter((tier) => tier.findings.length > 0);
        return tiers.map((tier, index) => RemediationFixSchema.parse({
            code: index === 0 ? POLICY_FINDING_CODE : `${POLICY_FINDING_CODE}.${tier.severity}`,
            severity: tier.severity,
            title: policyFindingTitle(tier.findings.map((finding) => finding.title)),
            detail: tier.findings.map(enumeratedFindingLine).join("\n"),
        }));
    }
    const findings = input.findings ?? [];
    if (findings.length === 0)
        return [];
    return [
        RemediationFixSchema.parse({
            code: POLICY_FINDING_CODE,
            severity: input.gateDecision === "block" ? "blocking" : "warn",
            title: policyFindingTitle(findings),
            detail: findings.map((f) => `- ${f}`).join("\n"),
        }),
    ];
}
/** ADR-011 §3 override mechanism — mirrors `OVERRIDE_LABEL` in `src/override.ts`,
 * inlined because override.ts is not part of the shared-source copy set. */
const OVERRIDE_LABEL = "trailhead-override";
const RISK_OVER_THRESHOLD_CODE = "risk.over_threshold";
/** The prose `computeReleaseReady()` emits for the same condition — the fallback
 * source of the pair when the caller has not threaded the numbers through. */
const RELEASE_READY_RISK_REASON = /^Risk score (\d+(?:\.\d+)?) exceeds threshold (\d+(?:\.\d+)?)$/;
function resolveRiskOverThreshold(evaluation) {
    const { riskScore, riskThreshold } = evaluation;
    if (riskScore !== undefined && riskThreshold !== undefined) {
        return riskScore > riskThreshold
            ? { score: riskScore, threshold: riskThreshold }
            : null;
    }
    for (const reason of evaluation.releaseReadyReasons ?? []) {
        const match = RELEASE_READY_RISK_REASON.exec(reason.trim());
        if (!match)
            continue;
        const score = Number(match[1]);
        const threshold = Number(match[2]);
        if (Number.isFinite(score) && Number.isFinite(threshold) && score > threshold) {
            return { score, threshold };
        }
    }
    return null;
}
/**
 * The machine-readable block cause when risk carries the verdict.
 *
 * Without it the fixes array named every finding except the one thing that
 * actually blocked the PR, and neither of the two real levers — a smaller PR or
 * a recorded override — appeared anywhere an agent could read them.
 */
function deriveRiskThresholdFixes(evaluation) {
    if (evaluation.gateDecision !== "block")
        return [];
    // A recorded override (ADR-011 §3) leaves the decision at `block` while the
    // release is ready on the record. Re-emitting the block cause as a blocking fix
    // would flip `release_ready` back to false and undo the override.
    if (evaluation.releaseReady === true)
        return [];
    const over = resolveRiskOverThreshold(evaluation);
    if (!over)
        return [];
    const movers = [...(evaluation.riskFactors ?? [])]
        .filter((factor) => factor.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    const moversText = movers.length
        ? movers.map((factor) => `${factor.type} ${factor.score}/100`).join(", ")
        : "no single factor dominates — the composite carries the score";
    return [
        RemediationFixSchema.parse({
            code: RISK_OVER_THRESHOLD_CODE,
            severity: "blocking",
            title: `risk ${over.score} exceeds threshold ${over.threshold}`,
            detail: `Composite risk score ${over.score} is above this PR's effective threshold of ${over.threshold}, so the gate blocks. Top risk factors: ${moversText}. No single file edit clears this: either the PR gets smaller (which lowers the factors above) or the risk is accepted on the record.`,
            suggested_action: `Reduce PR scope — split the change so the score falls below ${over.threshold} — or record an override: add the \`${OVERRIDE_LABEL}\` label and post a PR comment \`${OVERRIDE_LABEL}: <rationale>\`.`,
            autofix_eligible: false,
        }),
    ];
}
function fixSeverityFromFactor(factor, cue) {
    if (factor.score >= cue.triggerScore)
        return "blocking";
    if (cue.advisoryScore != null && factor.score >= cue.advisoryScore)
        return "warn";
    return "advisory";
}
function diffFixCodes(current, previous) {
    const currentCodes = new Set(current.map((f) => f.code));
    const previousCodes = new Set((previous ?? []).map((f) => f.code));
    const resolved = [];
    const introduced = [];
    for (const code of previousCodes) {
        if (!currentCodes.has(code))
            resolved.push(code);
    }
    for (const code of currentCodes) {
        if (!previousCodes.has(code))
            introduced.push(code);
    }
    return { resolved, introduced };
}
export function buildRemediation(input) {
    const fixes = [];
    for (const factor of input.evaluation.riskFactors ?? []) {
        const cue = factorCues[factor.type];
        if (!cue)
            continue;
        if (factor.score < cue.triggerScore &&
            (cue.advisoryScore == null || factor.score < cue.advisoryScore)) {
            continue;
        }
        const built = cue.build(factor);
        const severity = built.severity ?? fixSeverityFromFactor(factor, cue);
        fixes.push(RemediationFixSchema.parse({ ...built, severity }));
    }
    fixes.push(...deriveCiFixes(input.evaluation.ci));
    fixes.push(...derivePolicyFindingFixes({
        findings: input.evaluation.policyFindings,
        enumeratedFindings: input.evaluation.enumeratedFindings,
        gateDecision: input.evaluation.gateDecision,
    }));
    fixes.push(...deriveRiskThresholdFixes(input.evaluation));
    fixes.push(...deriveSubmissionFixes(input.submissionChecks));
    // Deduplicate by code, keeping the highest severity occurrence.
    const byCode = new Map();
    for (const fix of fixes) {
        const existing = byCode.get(fix.code);
        if (!existing || SEVERITY_RANK[fix.severity] > SEVERITY_RANK[existing.severity]) {
            byCode.set(fix.code, fix);
        }
    }
    const dedupedFixes = Array.from(byCode.values()).sort((a, b) => {
        const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
        if (sev !== 0)
            return sev;
        return a.code.localeCompare(b.code);
    });
    const blocking_count = dedupedFixes.filter((f) => f.severity === "blocking").length;
    const warn_count = dedupedFixes.filter((f) => f.severity === "warn").length;
    const advisory_count = dedupedFixes.filter((f) => f.severity === "advisory").length;
    const autofix_eligible_count = dedupedFixes.filter((f) => f.autofix_eligible).length;
    const loopRound = input.loopRound ?? resolveLoopRound(input.previousEvaluation);
    const maxLoopRounds = input.maxLoopRounds ?? 3;
    const releaseReady = blocking_count === 0 &&
        (input.evaluation.releaseReady ?? input.evaluation.gateDecision !== "block");
    const { resolved, introduced } = diffFixCodes(dedupedFixes, input.previousEvaluation?.remediation?.fixes);
    const next_action = computeNextAction({
        releaseReady,
        blockingCount: blocking_count,
        warnCount: warn_count,
        advisoryCount: advisory_count,
        loopRound,
        maxLoopRounds,
        agentProvenance: input.agentProvenance,
        fixes: dedupedFixes,
    });
    return {
        schema: "trailhead.remediation.v1",
        release_ready: releaseReady,
        fixes: dedupedFixes,
        blocking_count,
        warn_count,
        advisory_count,
        autofix_eligible_count,
        loop_round: loopRound,
        max_loop_rounds: maxLoopRounds,
        previous_evaluation_id: input.previousEvaluation?.id,
        fixes_resolved: resolved,
        fixes_introduced: introduced,
        next_action,
    };
}
export const SUGGESTED_COMMANDS = {
    test: SUGGESTED_TEST_COMMAND,
    lint: SUGGESTED_LINT_COMMAND,
    format: SUGGESTED_FORMAT_COMMAND,
};
export function resolveAgentBriefMode(input) {
    if (input.actionSetting)
        return input.actionSetting;
    if (input.repoSetting)
        return input.repoSetting;
    if (input.provenanceType === "human")
        return "off";
    return "collapsed";
}
function formatFixListItem(fix, index) {
    const prefix = index !== undefined
        ? `${index + 1}. **\`${fix.code}\` — ${fix.title}**`
        : `- \`${fix.code}\` — ${fix.title}`;
    const lines = [prefix];
    if (fix.files.length > 0) {
        lines.push(`   - Files: ${fix.files
            .slice(0, 8)
            .map((f) => `\`${f}\``)
            .join(", ")}${fix.files.length > 8 ? ", …" : ""}`);
    }
    if (fix.suggested_action) {
        lines.push(`   - Fix: ${fix.suggested_action}`);
    }
    if (fix.suggested_command) {
        lines.push(`   - Command: \`${fix.suggested_command}\``);
    }
    return lines;
}
export function formatAgentBrief(remediation, mode) {
    if (mode === "off")
        return "";
    const summaryParts = [];
    if (remediation.blocking_count > 0) {
        summaryParts.push(`${remediation.blocking_count} blocking`);
    }
    if (remediation.warn_count > 0) {
        summaryParts.push(`${remediation.warn_count} warn`);
    }
    if (summaryParts.length === 0 && remediation.advisory_count > 0) {
        summaryParts.push(`${remediation.advisory_count} advisory`);
    }
    const summaryLabel = summaryParts.length > 0 ? summaryParts.join(", ") : "no issues";
    const title = `🤖 Agent instructions (${summaryLabel})`;
    const bodyLines = [
        "```json",
        JSON.stringify(remediation, null, 2),
        "```",
        "",
    ];
    const blocking = remediation.fixes.filter((f) => f.severity === "blocking");
    const warn = remediation.fixes.filter((f) => f.severity === "warn");
    const advisory = remediation.fixes.filter((f) => f.severity === "advisory");
    if (blocking.length > 0) {
        bodyLines.push("**Blocking:**");
        blocking.forEach((fix, index) => {
            bodyLines.push(...formatFixListItem(fix, index));
        });
        bodyLines.push("");
    }
    if (warn.length > 0) {
        bodyLines.push("**Warn (non-blocking):**");
        for (const fix of warn) {
            bodyLines.push(...formatFixListItem(fix));
        }
        bodyLines.push("");
    }
    if (advisory.length > 0 && mode === "expanded") {
        bodyLines.push("**Advisory:**");
        for (const fix of advisory) {
            bodyLines.push(...formatFixListItem(fix));
        }
        bodyLines.push("");
    }
    if (remediation.fixes.length === 0 && remediation.release_ready) {
        bodyLines.push("No remediation items — this PR is ready to merge under current policy.", "");
    }
    bodyLines.push(`**Loop:** round ${remediation.loop_round} of ${remediation.max_loop_rounds} · **Next action:** \`${remediation.next_action}\``);
    const body = bodyLines.join("\n");
    if (mode === "expanded") {
        return `### ${title}\n\n${body}`;
    }
    return `<details><summary><strong>${title}</strong></summary>\n\n${body}\n\n</details>`;
}
