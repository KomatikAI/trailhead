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
  const path = `/${normalizePath(filename).toLowerCase()}`;
  return (
    /\/(?:__tests__|__fixtures__|tests?|test-fixtures|fixtures)\//.test(path) ||
    /\.(?:test|spec)\.[^./]+$/.test(path)
  );
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

const VALID_PACKAGE_SPECIFIER = /^(@[\w.-]+\/[\w.-]+|[\w@][\w.-]*)(?:\/[\w./-]*)?$/;

export function isValidPackageSpecifier(specifier: string): boolean {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("@/")) return false;
  if (/^https?:|^node:/.test(specifier)) return false;
  if (/[:()\\]/.test(specifier)) return false;
  return VALID_PACKAGE_SPECIFIER.test(specifier);
}

/** Extract module specifiers from full file content (legacy agent-gate parity). */
export function extractAllImports(
  content: string,
): Array<{ specifier: string; line: number }> {
  const results: Array<{ specifier: string; line: number }> = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const specifier = match[1];
      if (!specifier) continue;
      const line = content.slice(0, match.index ?? 0).split("\n").length;
      results.push({ specifier, line });
    }
  }
  return results;
}

export function linesForFreshnessScan(file: {
  filename: string;
  patch?: string;
  content?: string;
}): string[] {
  if (typeof file.content === "string") return file.content.split("\n");
  return addedLines(file.patch);
}
