import { getSubmissionConfigWarnings } from "./submission-checks/detector-policy.js";
import type { RepoConfig, SubmissionCheckResult } from "./types.js";
export type { SubmissionFileInfo } from "./submission-checks/types.js";
export type { SubmissionCheckCode, SubmissionCheckResult } from "./types.js";
export { getSubmissionConfigWarnings };
/** Gate 1 + Phase 0 submission check codes — keep in sync with A8 fixture manifest. */
export declare const SUBMISSION_CHECK_CODES: ["artifact_integrity", "mock_placeholder", "context_freshness", "destructive_sql", "secrets", "path_format", "syntax_validity", "import_resolution", "rls_new_tables", "auth_route_auth", "hardcoded_env", "external_package_deps", "sql_syntax_basic", "large_file", "soul_integrity", "contract_integrity", "safe_deprecation", "destructive_change", "claim_anchoring", "promotion_coherence", "output_size_min", "action_extraction_present", "delta_section_present", "preamble_absent", "graduation_signals_section_present", "fabricated_id_check", "session_narrative_detection", "incompleteness_self_flag", "referenced_files_exist", "prerequisite_secrets_check", "dependency_dag_validation", "uncommitted_fix_check", "verification_owner_assigned", "external_interface_validation"];
/** Package names declared in a package.json (legacy gate parity). */
export declare function declaredPackageNamesFromPackageJson(pkg: Record<string, unknown>): string[];
export interface SubmissionEngineOptions {
    files: import("./submission-checks/types.js").SubmissionFileInfo[];
    repoConfig?: RepoConfig | null;
    komatikInstance?: boolean;
    /** Home repo slug for the agent-suggestions convention (cross-repo detection). */
    agentRepo?: string;
    mode?: "warn" | "block";
    /** Declared npm package names from root package.json (optional). */
    declaredPackages?: string[];
    /** Paths that exist in the target repo (e.g. `git ls-files`), optional. */
    repoPaths?: string[];
    /**
     * Org catalog entity names resolved by the caller (I/O layer) — e.g. loaded
     * from `submission.contract_integrity.catalog_index_path`. Merged with the
     * inline `known_entities` config for the `contract_integrity` detector.
     */
    catalogKnownEntities?: string[];
    /** Promotion branch topology (GITHUB_BASE_REF / GITHUB_HEAD_REF), set by the gate. */
    promotion?: {
        baseBranch?: string;
        headBranch?: string;
    };
}
export declare function runSubmissionGate(options: SubmissionEngineOptions): SubmissionCheckResult[];
export declare function submissionGateShouldBlock(checks: SubmissionCheckResult[], mode?: "warn" | "block"): boolean;
