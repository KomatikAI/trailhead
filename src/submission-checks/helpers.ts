// Shared helpers for Gate 1 submission checks (pure, no I/O).

import type { SubmissionFileInfo } from "./types.js";

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function extensionOf(filename: string): string {
  const base = normalizePath(filename);
  const idx = base.lastIndexOf(".");
  return idx >= 0 ? base.slice(idx).toLowerCase() : "";
}

export function addedLines(patch: string | undefined): string[] {
  if (!patch) return [];
  return patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

/** Approximate post-change file body from a unified diff hunk (context + additions). */
export function effectiveContentFromPatch(patch: string | undefined): string {
  if (!patch) return "";
  return patch
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("@@") && !line.startsWith("---") && !line.startsWith("+++"),
    )
    .filter((line) => !line.startsWith("-"))
    .map((line) => (line.startsWith("+") || line.startsWith(" ") ? line.slice(1) : line))
    .join("\n");
}

export function fileContent(file: SubmissionFileInfo): string {
  if (typeof file.content === "string") return file.content;
  return effectiveContentFromPatch(file.patch);
}

export function lineCountFromPatch(patch: string | undefined): number {
  const content = effectiveContentFromPatch(patch);
  if (!content) return 0;
  return content.split("\n").length;
}

export function scanAddedContent(
  files: SubmissionFileInfo[],
  predicate: (line: string, filename: string) => boolean,
): string[] {
  const hits: string[] = [];
  for (const file of files) {
    for (const line of addedLines(file.patch)) {
      if (predicate(line, file.filename)) hits.push(file.filename);
    }
  }
  return [...new Set(hits)];
}

export function scanFileContent(
  files: SubmissionFileInfo[],
  predicate: (line: string, filename: string, lineNo: number) => boolean,
): Array<{ file: string; line: number }> {
  const hits: Array<{ file: string; line: number }> = [];
  for (const file of files) {
    const lines = fileContent(file).split("\n");
    lines.forEach((line, index) => {
      if (predicate(line, file.filename, index + 1)) {
        hits.push({ file: file.filename, line: index + 1 });
      }
    });
  }
  return hits;
}

export function prPathSet(files: SubmissionFileInfo[]): Set<string> {
  return new Set(files.map((f) => normalizePath(f.filename)));
}

export function isTestPath(filename: string): boolean {
  return /\/__tests__\/|\/test\/|\/fixtures\/|\.test\.|\.spec\./.test(filename);
}

/** Default archived/stale path segments skipped by context_freshness. */
export const DEFAULT_STALE_PATH_IGNORE = ["/_stale/", "/_archive/", "/.archive/"];

export function isStaleArchivedPath(
  filename: string,
  extraPatterns: string[] = [],
): boolean {
  const path = normalizePath(filename);
  return [...DEFAULT_STALE_PATH_IGNORE, ...extraPatterns].some((segment) =>
    path.includes(segment),
  );
}

export function packageJsonPathForFile(
  filename: string,
  prPaths: Set<string>,
): string | null {
  const parts = normalizePath(filename).split("/");
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = [...parts.slice(0, i), "package.json"].filter(Boolean).join("/");
    if (prPaths.has(candidate)) return candidate;
  }
  return prPaths.has("package.json") ? "package.json" : null;
}

/** Agent bundle paths like `payments/pack/src/...` without a local package.json in the PR. */
export function isCrossRepoSatellitePath(
  filename: string,
  prPaths: Set<string>,
): boolean {
  const path = normalizePath(filename);
  if (!/^[a-z][a-z0-9-]+\/[\w.-]+\/.+/.test(path)) return false;
  return packageJsonPathForFile(filename, prPaths) === null;
}

const VALID_PACKAGE_SPECIFIER = /^(@[\w.-]+\/[\w.-]+|[\w@][\w.-]*)(?:\/[\w./-]*)?$/;

export function isValidPackageSpecifier(specifier: string): boolean {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("@/")) return false;
  if (/^https?:|^node:/.test(specifier)) return false;
  if (/[:()\\]/.test(specifier)) return false;
  return VALID_PACKAGE_SPECIFIER.test(specifier);
}

/** Extract module specifiers from a single source line (import/require). */
export function extractImportSpecifiersFromLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) return [];

  const specifiers: string[] = [];
  const patterns = [
    /^\s*import\s+(?:type\s+)?(?:[\w*{}\s,$]|[^\S\r\n])+\s+from\s+['"]([^'"]+)['"]/,
    /^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) specifiers.push(match[1]);
  }
  return specifiers;
}
