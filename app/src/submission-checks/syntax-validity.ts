// Real parse-based syntax validation for Gate 1 (no bracket-count fallback).
// Parses full file content only — never a partial diff hunk (see submission-gate.md).

import { parseSync, type ParseOptions } from "@swc/core";
import yaml from "js-yaml";
import { extensionOf } from "./helpers.js";

const PARSEABLE = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;

function parserOptionsFor(ext: string): ParseOptions {
  const isTs = ext === ".ts" || ext === ".tsx";
  return {
    syntax: isTs ? "typescript" : "ecmascript",
    tsx: ext === ".tsx",
    jsx: ext === ".jsx",
    decorators: true,
    dynamicImport: true,
  };
}

/** Returns a one-line error message, or null when content parses cleanly. */
export function validateFileSyntax(filename: string, content: string): string | null {
  if (!content.trim()) return null;

  const ext = extensionOf(filename);
  try {
    if ((PARSEABLE as readonly string[]).includes(ext)) {
      parseSync(content, parserOptionsFor(ext));
    } else if (ext === ".json") {
      JSON.parse(content);
    } else if (ext === ".yaml" || ext === ".yml") {
      yaml.load(content);
    } else if (ext === ".md" && content.startsWith("---")) {
      const end = content.indexOf("\n---", 3);
      if (end > 0) yaml.load(content.slice(3, end));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return message || "Parse error";
  }
  return null;
}
