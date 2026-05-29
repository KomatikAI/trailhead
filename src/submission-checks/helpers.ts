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
