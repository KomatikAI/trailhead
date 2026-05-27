import type { RepoConfig as RepoConfigType } from "./types.js";
export declare const SUPPORTED_CONFIG_SCHEMA_VERSIONS: Set<number>;
export declare const CURRENT_CONFIG_SCHEMA_VERSION = 2;
export declare function parseYaml(input: string): unknown;
export declare function parseRepoConfigContent(content: string): RepoConfigType | null;
