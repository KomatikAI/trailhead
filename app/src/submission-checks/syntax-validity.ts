// Real parse-based syntax validation for Gate 1 (no bracket-count fallback).
// Parses full file content only — never a partial diff hunk (see submission-gate.md).

import { parseSync, type ParseOptions } from "@swc/core";
import yaml from "js-yaml";
import { extensionOf } from "./helpers.js";

const PARSEABLE = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;

/** Parse real import nodes, never import-looking text in comments or templates. */
export function relativeImportSpecifiers(filename: string, content: string): string[] {
  const imports = new Set<string>();
  function add(value: unknown): void {
    if (typeof value === "string" && /^(?:\.\/|\.\.\/)/.test(value)) imports.add(value);
  }
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    if (
      ["ImportDeclaration", "ExportAllDeclaration", "ExportNamedDeclaration"].includes(
        String(node.type),
      )
    ) {
      add((node.source as { value?: unknown } | undefined)?.value);
    }
    if (node.type === "CallExpression") {
      const callee = node.callee as { type?: string; value?: string };
      if (
        callee.type === "Import" ||
        (callee.type === "Identifier" && callee.value === "require")
      ) {
        const args = node.arguments as {
          expression?: { type?: string; value?: unknown };
        }[];
        if (args[0]?.expression?.type === "StringLiteral") add(args[0].expression.value);
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== "span") visit(child);
    }
  }
  try {
    visit(parseSync(content, parserOptionsFor(extensionOf(filename))));
  } catch {
    // syntax_validity owns parse failures; an incomplete file is not proof of
    // an unresolved import. In particular, never parse partial diff text here.
  }
  return [...imports];
}

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
