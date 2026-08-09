import type { RepoConfig as RepoConfigType } from "./types.js";
export declare const SUPPORTED_CONFIG_SCHEMA_VERSIONS: Set<number>;
export declare const CURRENT_CONFIG_SCHEMA_VERSION = 2;
export declare function parseYaml(input: string): unknown;
/**
 * Non-fatal config warnings, emitted by the loader after a successful parse.
 *
 * ADR-011 §2 makes `reason` mandatory for `disposition: irrelevant`, but this is
 * deliberately NOT a Zod refine: `parseRepoConfigContent` returns null for ANY
 * schema violation, which drops the entire repo config back to hardcoded
 * defaults. Degrading a whole config over one missing reason string is worse
 * than narrating it, so the entry still parses and the Release Brief prints a
 * placeholder reason (see MISSING_IRRELEVANT_REASON in input-relevance.ts).
 */
export declare function collectConfigWarnings(config: RepoConfigType): string[];
export declare function parseRepoConfigContent(content: string): RepoConfigType | null;
