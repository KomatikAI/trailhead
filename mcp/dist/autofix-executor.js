// Shared autofix git-write executor (ADR-010 / Phase B2 completion).
//
// fixer-core plans WHICH fix to apply (one per round, red-lane + class gated).
// This module turns that plan into an actual commit: it asks a content builder
// for the concrete file edits, then hands them to an injected GitWriter. The
// GitWriter is an interface so the same executor runs in the Action, the App, or
// a unit test (mock writer) — no package bound to a specific GitHub client.
import { buildAutofixPlan, selectAutofixCommit } from "./fixer-core.js";
const COMMIT_PREFIX = "[trailhead-fixer]";
/**
 * Apply at most one autofix commit for this evaluation round. Returns a
 * structured result describing what was (or would be) committed, or why it was
 * skipped. Never throws on "nothing to do" — only the writer may reject.
 */
export async function executeAutofixRound(opts) {
    const base = { committed: false, evaluationId: opts.evaluationId };
    if (opts.trustAutofixEnabled === false) {
        return { ...base, skippedReason: "Trust autofix disabled" };
    }
    const plan = buildAutofixPlan(opts.fixes);
    const selected = selectAutofixCommit(plan);
    if (!selected) {
        return {
            ...base,
            skippedReason: plan.blocked.length > 0
                ? "All autofix candidates blocked (red lane or disallowed class)"
                : "No autofix-eligible fixes in remediation payload",
        };
    }
    const meta = {
        autofixClass: selected.autofix_class,
        fixCode: selected.fix.code,
    };
    const builder = opts.builders[selected.fix.code];
    if (!builder) {
        return {
            ...base,
            ...meta,
            skippedReason: `No content builder for ${selected.fix.code}`,
        };
    }
    const edits = builder(selected, opts.files, opts.buildContext ?? {});
    if (edits.length === 0) {
        return { ...base, ...meta, skippedReason: "Builder produced no edits" };
    }
    const message = opts.message ??
        `${COMMIT_PREFIX} ${selected.autofix_class}: ${selected.fix.code} (eval ${opts.evaluationId})`;
    if (opts.dryRun) {
        return {
            ...base,
            ...meta,
            files: edits.map((e) => e.path),
            edits,
            message: `dry-run: would commit ${edits.length} file(s)`,
        };
    }
    const { commitSha } = await opts.writer.commitFiles({
        branch: opts.branch,
        message,
        edits,
    });
    return {
        committed: true,
        evaluationId: opts.evaluationId,
        ...meta,
        files: edits.map((e) => e.path),
        edits,
        commitSha,
        message,
    };
}
