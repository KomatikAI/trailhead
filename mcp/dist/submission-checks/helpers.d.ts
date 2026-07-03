import type { SubmissionFileInfo } from "./types.js";
export declare function normalizePath(filePath: string): string;
export declare function extensionOf(filename: string): string;
export declare function addedLines(patch: string | undefined): string[];
/** Approximate post-change file body from a unified diff hunk (context + additions). */
export declare function effectiveContentFromPatch(patch: string | undefined): string;
export declare function fileContent(file: SubmissionFileInfo): string;
export declare function lineCountFromPatch(patch: string | undefined): number;
export declare function scanAddedContent(files: SubmissionFileInfo[], predicate: (line: string, filename: string) => boolean): string[];
export declare function scanFileContent(files: SubmissionFileInfo[], predicate: (line: string, filename: string, lineNo: number) => boolean): Array<{
    file: string;
    line: number;
}>;
export declare function prPathSet(files: SubmissionFileInfo[]): Set<string>;
export declare function isTestPath(filename: string): boolean;
/** Default archived/stale path segments skipped by context_freshness. */
export declare const DEFAULT_STALE_PATH_IGNORE: string[];
export declare function isStaleArchivedPath(filename: string, extraPatterns?: string[]): boolean;
export declare function packageJsonPathForFile(filename: string, prPaths: Set<string>): string | null;
export declare function isValidPackageSpecifier(specifier: string): boolean;
/** Extract module specifiers from full file content (legacy agent-gate parity). */
export declare function extractAllImports(content: string): Array<{
    specifier: string;
    line: number;
}>;
export declare function linesForFreshnessScan(file: {
    filename: string;
    patch?: string;
    content?: string;
}): string[];
