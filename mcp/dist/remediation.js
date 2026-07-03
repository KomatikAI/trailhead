// Pure remediation derivation — no framework dependencies.
// Maps gate findings (risk factors, CI failures, policy violations, release-ready
// reasons) into a machine-readable Remediation block that agents can act on.
//
// Shared across the GitHub Action, MCP server, and GitHub App via the existing
// prebuild copy pattern. Keep this module free of @actions/*, octokit, and Node
// runtime imports so it stays portable.
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
            const files = factor.detail?.file_count ?? 0;
            const changes = factor.detail?.line_count ?? 0;
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
function derivePolicyFindingFixes(findings) {
    if (!findings || findings.length === 0)
        return [];
    return [
        RemediationFixSchema.parse({
            code: "policy.finding",
            severity: "blocking",
            title: `${findings.length} policy finding${findings.length === 1 ? "" : "s"}`,
            detail: findings.map((f) => `- ${f}`).join("\n"),
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
    fixes.push(...derivePolicyFindingFixes(input.evaluation.policyFindings));
    fixes.push(...deriveSubmissionFixes(input.submissionChecks));
    // Deduplicate by code, keeping the highest severity occurrence.
    const severityRank = {
        blocking: 3,
        warn: 2,
        advisory: 1,
    };
    const byCode = new Map();
    for (const fix of fixes) {
        const existing = byCode.get(fix.code);
        if (!existing || severityRank[fix.severity] > severityRank[existing.severity]) {
            byCode.set(fix.code, fix);
        }
    }
    const dedupedFixes = Array.from(byCode.values()).sort((a, b) => {
        const sev = severityRank[b.severity] - severityRank[a.severity];
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
