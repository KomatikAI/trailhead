// Real parse-based syntax validation for Gate 1 (no bracket-count fallback).
// Parses full file content only — never a partial diff hunk (see submission-gate.md).
import { parseSync } from "@swc/core";
import yaml from "js-yaml";
import { extensionOf } from "./helpers.js";
const PARSEABLE = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
/** Parse real import nodes, never import-looking text in comments or templates. */
export function relativeImportSpecifiers(filename, content) {
    const imports = new Set();
    function add(value) {
        if (typeof value === "string" && /^(?:\.\/|\.\.\/)/.test(value))
            imports.add(value);
    }
    function visit(value) {
        if (!value || typeof value !== "object")
            return;
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        const node = value;
        if (["ImportDeclaration", "ExportAllDeclaration", "ExportNamedDeclaration"].includes(String(node.type))) {
            add(node.source?.value);
        }
        if (node.type === "CallExpression") {
            const callee = node.callee;
            if (callee.type === "Import" ||
                (callee.type === "Identifier" && callee.value === "require")) {
                const args = node.arguments;
                if (args[0]?.expression?.type === "StringLiteral")
                    add(args[0].expression.value);
            }
        }
        for (const [key, child] of Object.entries(node)) {
            if (key !== "span")
                visit(child);
        }
    }
    try {
        visit(parseSync(content, parserOptionsFor(extensionOf(filename))));
    }
    catch {
        // syntax_validity owns parse failures; an incomplete file is not proof of
        // an unresolved import. In particular, never parse partial diff text here.
    }
    return [...imports];
}
function parserOptionsFor(ext) {
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
export function validateFileSyntax(filename, content) {
    if (!content.trim())
        return null;
    const ext = extensionOf(filename);
    try {
        if (PARSEABLE.includes(ext)) {
            parseSync(content, parserOptionsFor(ext));
        }
        else if (ext === ".json") {
            JSON.parse(content);
        }
        else if (ext === ".yaml" || ext === ".yml") {
            yaml.load(content);
        }
        else if (ext === ".md" && content.startsWith("---")) {
            const end = content.indexOf("\n---", 3);
            if (end > 0)
                yaml.load(content.slice(3, end));
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
        return message || "Parse error";
    }
    return null;
}
