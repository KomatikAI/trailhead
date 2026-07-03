import type { AutofixPlanItem } from "./fixer-core.js";
import type { RemediationFix } from "./types.js";
import type { SubmissionFileInfo } from "./submission-checks/types.js";
/** A whole-file replacement (the executor builds full content, not patches). */
export interface FileEdit {
    path: string;
    content: string;
}
/** Commits a set of file edits to a branch as ONE commit. */
export interface GitWriter {
    commitFiles(args: {
        branch: string;
        message: string;
        edits: FileEdit[];
    }): Promise<{
        commitSha: string;
    }>;
}
/** Context a builder may need beyond the changed files. */
export interface AutofixBuildContext {
    /** Org catalog index (for contract_integrity cross-repo resolution). */
    catalogKnownEntities?: Set<string>;
}
/** Produces the concrete file edits that resolve a planned fix. */
export type AutofixContentBuilder = (item: AutofixPlanItem, files: SubmissionFileInfo[], context: AutofixBuildContext) => FileEdit[];
/** fix.code → content builder. */
export type AutofixBuilderRegistry = Record<string, AutofixContentBuilder>;
export interface AutofixExecuteOptions {
    fixes: RemediationFix[];
    files: SubmissionFileInfo[];
    builders: AutofixBuilderRegistry;
    writer: GitWriter;
    branch: string;
    evaluationId: string;
    trustAutofixEnabled?: boolean;
    /** Compute + build edits but do not commit. */
    dryRun?: boolean;
    /** Commit message override. */
    message?: string;
    buildContext?: AutofixBuildContext;
}
export interface AutofixExecuteResult {
    committed: boolean;
    evaluationId: string;
    autofixClass?: string;
    fixCode?: string;
    files?: string[];
    edits?: FileEdit[];
    commitSha?: string;
    message?: string;
    skippedReason?: string;
}
/**
 * Apply at most one autofix commit for this evaluation round. Returns a
 * structured result describing what was (or would be) committed, or why it was
 * skipped. Never throws on "nothing to do" — only the writer may reject.
 */
export declare function executeAutofixRound(opts: AutofixExecuteOptions): Promise<AutofixExecuteResult>;
