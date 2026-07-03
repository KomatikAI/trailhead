import { type ContractRefFinding } from "./submission-checks/contract-integrity.js";
import { type GitRestClient } from "./github-git-writer.js";
/** A repo we must open a declaration PR in, with the entities to declare. */
export interface CrossRepoTarget {
    owner: string;
    repo: string;
    /** Entity (API) names this owning repo should declare, deduped + sorted. */
    entities: string[];
}
export interface UnresolvedContractRef {
    name: string;
    field: string;
    file: string;
    reason: string;
}
export type CrossRepoOpenStatus = "opened" | "exists" | "dry-run" | "error" | "skipped";
export interface CrossRepoOpenOutcome {
    owner: string;
    repo: string;
    entities: string[];
    status: CrossRepoOpenStatus;
    branch?: string;
    prNumber?: number;
    prUrl?: string;
    reason?: string;
}
export interface CrossRepoOpenerResult {
    evaluationId: string;
    enabled: boolean;
    outcomes: CrossRepoOpenOutcome[];
    unresolved: UnresolvedContractRef[];
    skippedReason?: string;
}
/** Octokit subset the opener needs: git-data writes + content read + repo/PR ops. */
export interface CrossRepoOpenerClient extends GitRestClient {
    rest: GitRestClient["rest"] & {
        git: GitRestClient["rest"]["git"] & {
            createRef(p: {
                owner: string;
                repo: string;
                ref: string;
                sha: string;
            }): Promise<unknown>;
        };
        repos: {
            get(p: {
                owner: string;
                repo: string;
            }): Promise<{
                data: {
                    default_branch: string;
                };
            }>;
            getContent(p: {
                owner: string;
                repo: string;
                path: string;
                ref?: string;
            }): Promise<{
                data: unknown;
            }>;
        };
        pulls: {
            list(p: {
                owner: string;
                repo: string;
                state?: "open" | "closed" | "all";
                head?: string;
            }): Promise<{
                data: Array<{
                    number: number;
                    html_url?: string;
                    head?: {
                        ref?: string;
                    };
                }>;
            }>;
            create(p: {
                owner: string;
                repo: string;
                title: string;
                head: string;
                base: string;
                body: string;
            }): Promise<{
                data: {
                    number: number;
                    html_url?: string;
                };
            }>;
        };
    };
}
export interface RunCrossRepoOpenerOptions {
    client: CrossRepoOpenerClient;
    /** Repo whose PR triggered the gate (source of the dangling consume refs). */
    gatedOwner: string;
    gatedRepo: string;
    /** PR head branch on the gated repo — where we read the consuming catalog. */
    headBranch?: string;
    /** Catalog files changed in the gated PR (the consume declarations live here). */
    catalogPaths: string[];
    evaluationId: string;
    /** Org catalog index — so we surface the SAME dangling refs the gate did. */
    knownEntities?: Set<string>;
    /** entity name → "owner/repo" that should publish it. The resolution registry. */
    apiOwners: Record<string, string>;
    /** Owners we may open PRs in. Defaults to [gatedOwner] (same org only). */
    ownerAllowlist?: string[];
    /** Provenance for the opened PR body. */
    prContext?: {
        number?: number;
        url?: string;
    };
    /** When false (default), plan only — open nothing. */
    enabled?: boolean;
}
/**
 * Group dangling CROSS-REPO contract refs (consumesApis / dependsOn) by the
 * owning repo from the api_owners map. Refs with no mapped owner, or whose owner
 * is outside the allowlist, are returned as unresolved (suggestion-only).
 */
export declare function resolveCrossRepoTargets(findings: ContractRefFinding[], apiOwners: Record<string, string>, ownerAllowlist: string[]): {
    targets: CrossRepoTarget[];
    unresolved: UnresolvedContractRef[];
};
/**
 * Resolve dangling cross-repo contract refs from the gated PR's catalog files
 * and open a declaration PR in each owning repo. Dry-run unless `enabled`.
 * Never throws — returns a structured result (or a skip reason).
 */
export declare function runCrossRepoOpener(opts: RunCrossRepoOpenerOptions): Promise<CrossRepoOpenerResult>;
