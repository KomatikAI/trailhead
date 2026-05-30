// Gate 1 detectors — ported from komatik-agents agent-gate-checks (patch/content based).

import type { SubmissionCheckResult } from "../types.js";
import type { SubmissionCheckContext } from "./types.js";
import {
  addedLines,
  extensionOf,
  extractImportSpecifiersFromLine,
  fileContent,
  isCrossRepoSatellitePath,
  isStaleArchivedPath,
  isTestPath,
  isValidPackageSpecifier,
  lineCountFromPatch,
  normalizePath,
  scanAddedContent,
} from "./helpers.js";
import { runPhase0Detectors } from "./phase0-detectors.js";
import { validateFileSyntax } from "./syntax-validity.js";

export const OLD_NAME_PATTERNS: Array<{
  oldName: string;
  newName: string;
  pattern: RegExp;
}> = [
  { oldName: "DeployGuard", newName: "Trailhead", pattern: /\bDeployGuard\b/g },
  { oldName: "Daydream Studio", newName: "Sundog", pattern: /\bDaydream Studio\b/g },
  {
    oldName: "Storyboard Studio",
    newName: "Kindling",
    pattern: /\bStoryboard Studio\b/g,
  },
  { oldName: "Cognitive Debt", newName: "Drift", pattern: /\bCognitive Debt\b/g },
  { oldName: "cognitive-debt", newName: "Drift", pattern: /\bcognitive-debt\b/g },
];

const MOCK_PATTERNS = [
  /\bTODO\s*\(\s*mock\s*\)/i,
  /\bFIXME\s*\(\s*mock\s*\)/i,
  /\bMOCK_[A-Z0-9_]+\b/,
  /\bfakeImplementation\b/,
  /\bstubResponse\s*\(/i,
  /\b(?:generate|create|build|get)(?:Mock|Fake|Dummy|Sample)\w*/g,
  /\b(?:mockData|fakeData|sampleData|dummyData|testData)\b/g,
  /\bTODO:\s*implement\b/gi,
  /\bFIXME\b/g,
  /\bIn production,\s*use\b/i,
  /\bplaceholder\b/gi,
  /\blorem ipsum\b/gi,
];

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { name: "Stripe live key", pattern: /\bsk_live_[A-Za-z0-9]{10,}\b/g },
  { name: "Stripe test key", pattern: /\bsk_test_[A-Za-z0-9]{10,}\b/g },
  { name: "Private key block", pattern: /-----BEGIN [A-Z ]+PRIVATE KEY-----/g },
  {
    name: "Generic API key assignment",
    pattern: /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_-]{32,}['"]/gi,
  },
];

const HARDCODED_ENV_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "localhost with port", pattern: /(?:['"`])localhost:\d{2,5}(?:['"`])/g },
  {
    name: "hardcoded private IP",
    pattern:
      /(?:['"`])(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(?::\d+)?(?:['"`])/g,
  },
];

const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "dns",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "process",
  "stream",
  "url",
  "util",
  "zlib",
]);

function result(
  partial: Omit<SubmissionCheckResult, "autofix_eligible"> & {
    autofix_eligible?: boolean;
  },
): SubmissionCheckResult {
  return { autofix_eligible: false, ...partial };
}

export function detectMockPlaceholder(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const hits = scanAddedContent(ctx.files, (line, filename) => {
    if (isTestPath(filename)) return false;
    if (/\.(md|txt)$/i.test(filename)) return false;
    return MOCK_PATTERNS.some((re) => {
      re.lastIndex = 0;
      return re.test(line);
    });
  });
  if (hits.length === 0) return null;
  return result({
    code: "mock_placeholder",
    severity: "blocking",
    title: "Mock placeholder in production path",
    detail: `Found mock/TODO placeholder patterns in ${hits.join(", ")}.`,
    files: hits,
    suggested_action: "Remove mock placeholders and implement real behavior.",
  });
}

export function detectSecrets(ctx: SubmissionCheckContext): SubmissionCheckResult | null {
  const hits = scanAddedContent(ctx.files, (line) =>
    SECRET_PATTERNS.some((entry) => {
      entry.pattern.lastIndex = 0;
      return entry.pattern.test(line);
    }),
  );
  if (hits.length === 0) return null;
  return result({
    code: "secrets",
    severity: "blocking",
    title: "Potential secret in diff",
    detail: `Added lines match secret patterns in ${hits.join(", ")}.`,
    files: hits,
    suggested_action: "Remove secrets; use environment variables or a secret manager.",
  });
}

export function detectDestructiveSql(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const sqlFiles = ctx.files.filter((f) => extensionOf(f.filename) === ".sql");
  const hits = scanAddedContent(sqlFiles, (line) =>
    /\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM(?![^\n]*\bWHERE\b))/i.test(line),
  );
  if (hits.length === 0) return null;
  return result({
    code: "destructive_sql",
    severity: "blocking",
    title: "Destructive SQL in migration",
    detail: `Added SQL contains destructive statements in ${hits.join(", ")}.`,
    files: hits,
    suggested_action:
      "Use additive migrations; avoid DROP/TRUNCATE without human approval.",
  });
}

export function detectArtifactIntegrity(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const referenced = new Set<string>();
  const pathRefPattern =
    /(?:^|\s|['"`])([\w@./-]+\.(?:ts|tsx|js|jsx|md|sql|yml|yaml|json))(?:['"`]|\s|:)/g;

  for (const file of ctx.files) {
    for (const line of addedLines(file.patch)) {
      if (!/(?:import|from|require|see|fix|update)\s/i.test(line)) continue;
      for (const match of line.matchAll(pathRefPattern)) {
        const candidate = match[1]?.replace(/^\.\//, "");
        if (!candidate || candidate.includes("*")) continue;
        if (!ctx.prPaths.has(candidate) && !candidate.startsWith("node:")) {
          referenced.add(candidate);
        }
      }
    }
  }

  if (referenced.size === 0) return null;
  const missing = [...referenced].slice(0, 8);
  return result({
    code: "artifact_integrity",
    severity: "blocking",
    title: "Referenced files missing from PR",
    detail: `Added lines reference paths not in this PR: ${missing.join(", ")}${referenced.size > 8 ? "…" : ""}.`,
    files: missing,
    suggested_action: "Include referenced files or fix hallucinated paths.",
  });
}

function isNamingAllowlisted(filename: string, line: string): boolean {
  const trimmed = line.trim();
  if (/^import\s|^from\s|require\(/.test(trimmed)) return true;
  if (/\.sql$/i.test(filename)) return true;
  if (/(?:^|\/)migrations\//.test(filename)) return true;
  if (/(?:^|\/)memory\//.test(filename)) return true;
  if (/RESEARCH\.md$|BRAND\.md$|CHANGELOG\.md$/.test(filename)) return true;
  if (/^\[.*\]\(.*\)/.test(trimmed)) return true;
  return false;
}

export function detectContextFreshness(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  if (ctx.staleTerms.length === 0 && !ctx.komatikInstance) return null;

  const hits: string[] = [];
  for (const file of ctx.files) {
    if (isStaleArchivedPath(file.filename, ctx.pathIgnorePatterns)) continue;
    for (const line of addedLines(file.patch)) {
      if (isNamingAllowlisted(file.filename, line)) continue;

      const terms = ctx.staleTerms.length > 0 ? ctx.staleTerms : [];
      for (const term of terms) {
        if (line.toLowerCase().includes(term.toLowerCase())) hits.push(file.filename);
      }

      if (ctx.komatikInstance) {
        for (const entry of OLD_NAME_PATTERNS) {
          entry.pattern.lastIndex = 0;
          if (entry.pattern.test(line)) hits.push(file.filename);
        }
      }
    }
  }

  const unique = [...new Set(hits)];
  if (unique.length === 0) return null;
  return result({
    code: "context_freshness",
    severity: "warn",
    title: "Stale naming or deprecated terms",
    detail: `Added lines reference deprecated terms in ${unique.join(", ")}.`,
    files: unique,
    suggested_action: "Update naming to current product vocabulary (see BRAND.md).",
    autofix_eligible: true,
  });
}

export function detectPathFormat(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  if (!ctx.komatikInstance) return null;
  const hits = ctx.files
    .map((f) => normalizePath(f.filename))
    .filter(
      (name) =>
        /^komatik-agents\/agents\//.test(name) ||
        /\/agents\/agents\//.test(name) ||
        (!/^agents\/[a-z][a-z0-9-]*\/suggestions\//.test(name) &&
          /\/suggestions\//.test(name) &&
          !name.startsWith("agents/")),
    );
  if (hits.length === 0) return null;
  return result({
    code: "path_format",
    severity: "warn",
    title: "Suspicious agent suggestion path",
    detail: `Paths should match agents/<id>/suggestions/<project>/… — found: ${hits.join(", ")}.`,
    files: hits,
    suggested_action: "Use canonical agent suggestion paths without repo prefix.",
  });
}

export function detectHardcodedEnv(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const hits = scanAddedContent(ctx.files, (line, filename) => {
    if (/\.(md|txt)$/i.test(filename)) return false;
    if (/^\s*\/\/|^\s*\*|^\s*#/.test(line)) return false;
    return HARDCODED_ENV_PATTERNS.some((entry) => {
      entry.pattern.lastIndex = 0;
      return entry.pattern.test(line);
    });
  });
  if (hits.length === 0) return null;
  return result({
    code: "hardcoded_env",
    severity: "blocking",
    title: "Hardcoded environment value",
    detail: `Added lines contain hardcoded localhost/IP patterns in ${hits.join(", ")}.`,
    files: hits,
    suggested_action:
      "Use environment variables or configuration instead of hardcoded hosts.",
  });
}

export function detectLargeFile(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const hits = ctx.files
    .filter((file) => {
      const lines =
        typeof file.content === "string"
          ? file.content.split("\n").length
          : lineCountFromPatch(file.patch);
      return lines > ctx.maxFileLines;
    })
    .map((f) => f.filename);
  if (hits.length === 0) return null;
  return result({
    code: "large_file",
    severity: "warn",
    title: "Large file in PR",
    detail: `Files exceed ${ctx.maxFileLines} lines: ${hits.join(", ")}.`,
    files: hits,
    suggested_action: "Split large changes into smaller PRs.",
  });
}

function extractRelativeImports(content: string): string[] {
  const imports: string[] = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?['"](\.\.?[^'"]+)['"]/g,
    /\brequire\(\s*['"](\.\.?[^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) imports.push(match[1]);
    }
  }
  return imports;
}

function resolveRelativeImport(
  fromFile: string,
  specifier: string,
  prPaths: Set<string>,
): boolean {
  const clean = specifier.split("?")[0].split("#")[0];
  const baseDir = normalizePath(fromFile).split("/").slice(0, -1);
  const segments = clean.replace(/^\.\//, "").split("/");
  for (const segment of segments) {
    if (segment === "..") baseDir.pop();
    else if (segment !== ".") baseDir.push(segment);
  }
  const resolved = baseDir.join("/");
  const candidates = [
    resolved,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.js`,
    `${resolved}.jsx`,
    `${resolved}/index.ts`,
    `${resolved}/index.js`,
  ];
  return candidates.some((c) => prPaths.has(c));
}

export function detectImportResolution(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const codeExts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
  const hits: string[] = [];

  for (const file of ctx.files) {
    if (!codeExts.has(extensionOf(file.filename))) continue;
    const content = fileContent(file);
    for (const specifier of extractRelativeImports(content)) {
      if (!resolveRelativeImport(file.filename, specifier, ctx.prPaths)) {
        hits.push(file.filename);
        break;
      }
    }
  }

  if (hits.length === 0) return null;
  return result({
    code: "import_resolution",
    severity: "blocking",
    title: "Unresolved relative import",
    detail: `Relative imports could not be resolved within this PR: ${[...new Set(hits)].join(", ")}.`,
    files: [...new Set(hits)],
    suggested_action: "Add missing files to the PR or fix import paths.",
  });
}

export function detectRlsNewTables(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const sqlFiles = ctx.files.filter((f) => extensionOf(f.filename) === ".sql");
  const corpus = sqlFiles.map((f) => fileContent(f)).join("\n");
  const hits: string[] = [];
  const createTable =
    /\bCREATE\s+(?!TEMP(?:ORARY)?\s+)TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"?[A-Za-z_][\w$]*"?\.)?"?[A-Za-z_][\w$]*"?)/gi;

  for (const file of sqlFiles) {
    const content = fileContent(file);
    for (const match of content.matchAll(createTable)) {
      const table = match[1]?.replace(/"/g, "") ?? "";
      const pattern = new RegExp(
        `ALTER\\s+TABLE\\s+(?:ONLY\\s+)?["']?${table.split(".").pop()}["']?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        "i",
      );
      if (!pattern.test(corpus)) hits.push(file.filename);
    }
  }

  if (hits.length === 0) return null;
  return result({
    code: "rls_new_tables",
    severity: "blocking",
    title: "New table missing RLS",
    detail: `CREATE TABLE without ENABLE ROW LEVEL SECURITY in ${[...new Set(hits)].join(", ")}.`,
    files: [...new Set(hits)],
    suggested_action:
      "Add ALTER TABLE ... ENABLE ROW LEVEL SECURITY for every new table.",
  });
}

function isRouteAllowlisted(path: string, allowlist: string[]): boolean {
  return allowlist.some((entry) => path.includes(entry.replace(/^\//, "")));
}

export function detectAuthRouteAuth(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const routePattern =
    /(?:^|\/)(?:app\/api\/.+\/route|pages\/api\/.+)\.(?:ts|tsx|js|jsx)$/;
  const authPattern =
    /\b(getUser|getSession|getServerSession|auth|requireAuth|withAuth)\s*\(/;
  const hits: string[] = [];

  for (const file of ctx.files) {
    const normalized = normalizePath(file.filename);
    if (!routePattern.test(normalized)) continue;
    if (isRouteAllowlisted(normalized, ctx.authRouteAllowlist)) continue;
    if (!authPattern.test(fileContent(file))) hits.push(normalized);
  }

  if (hits.length === 0) return null;
  return result({
    code: "auth_route_auth",
    severity: "blocking",
    title: "API route missing auth check",
    detail: `Routes appear to lack session/user verification: ${hits.join(", ")}.`,
    files: hits,
    suggested_action: "Verify authenticated user before handling the request.",
  });
}

function packageNameFromSpecifier(specifier: string): string {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

function isNodeBuiltin(specifier: string): boolean {
  const bare = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
  return NODE_BUILTINS.has(bare.split("/")[0]);
}

export function detectExternalPackageDeps(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  if (ctx.declaredPackages.size === 0) return null;
  const codeExts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
  const hits: string[] = [];

  for (const file of ctx.files) {
    if (!codeExts.has(extensionOf(file.filename))) continue;
    if (isCrossRepoSatellitePath(file.filename, ctx.prPaths)) continue;

    for (const line of fileContent(file).split("\n")) {
      for (const specifier of extractImportSpecifiersFromLine(line)) {
        if (!isValidPackageSpecifier(specifier)) continue;
        if (specifier.startsWith(".") || specifier.startsWith("@/")) continue;
        if (isNodeBuiltin(specifier)) continue;
        const pkg = packageNameFromSpecifier(specifier);
        if (!ctx.declaredPackages.has(pkg)) hits.push(`${file.filename} → ${pkg}`);
      }
    }
  }

  if (hits.length === 0) return null;
  return result({
    code: "external_package_deps",
    severity: "warn",
    title: "Undeclared package import",
    detail: hits.slice(0, 6).join("; "),
    files: [...new Set(hits.map((h) => h.split(" → ")[0]))],
    suggested_action: "Add the package to package.json or remove the import.",
  });
}

function stripSqlComments(content: string): string {
  return content.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function countPlpgsqlBlockBegins(sql: string): number {
  const re = /\bBEGIN\b(?!\s+(?:TRANSACTION|WORK)\b)/gi;
  return (sql.match(re) || []).length;
}

function countPlpgsqlBlockEnds(sql: string): number {
  const re = /\bEND\s*(?!IF\b|LOOP\b|CASE\b)\s*(?:;|\$\$)/gi;
  return (sql.match(re) || []).length;
}

export function detectSqlSyntaxBasic(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const hits: string[] = [];
  for (const file of ctx.files.filter((f) => extensionOf(f.filename) === ".sql")) {
    const stripped = stripSqlComments(fileContent(file));
    const beginCount = countPlpgsqlBlockBegins(stripped);
    const endCount = countPlpgsqlBlockEnds(stripped);
    if (beginCount > 0 && beginCount > endCount) hits.push(file.filename);
  }
  if (hits.length === 0) return null;
  return result({
    code: "sql_syntax_basic",
    severity: "warn",
    title: "SQL block balance issue",
    detail: `Possible unclosed BEGIN block in ${hits.join(", ")}.`,
    files: hits,
    suggested_action: "Verify PL/pgSQL block structure before merging.",
  });
}

export function detectSyntaxValidity(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const errors: string[] = [];

  for (const file of ctx.files) {
    // Real parsers need the whole file — skip patch-only inputs (PR diff fragments).
    if (typeof file.content !== "string") continue;

    const message = validateFileSyntax(file.filename, file.content);
    if (message) errors.push(`${file.filename}: ${message}`);
  }

  if (errors.length === 0) return null;
  return result({
    code: "syntax_validity",
    severity: "blocking",
    title: "Syntax error in submitted file",
    detail: errors.slice(0, 12).join("; "),
    files: errors.map((e) => e.split(": ")[0] ?? e),
    suggested_action: "Fix the parse error before submitting.",
  });
}

export function detectSoulIntegrity(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  if (!ctx.komatikInstance) return null;
  const hits = ctx.files
    .map((f) => normalizePath(f.filename))
    .filter((name) => /^agents\/[a-z][a-z0-9-]*\/SOUL\.md$/.test(name));
  if (hits.length === 0) return null;
  return result({
    code: "soul_integrity",
    severity: "blocking",
    title: "Agent SOUL.md modified",
    detail: `SOUL changes require human review: ${hits.join(", ")}.`,
    files: hits,
    suggested_action: "Revert SOUL.md changes or request explicit human approval.",
  });
}

export function runAllDetectors(ctx: SubmissionCheckContext): SubmissionCheckResult[] {
  const gate1 = [
    detectMockPlaceholder(ctx),
    detectSecrets(ctx),
    detectDestructiveSql(ctx),
    detectSyntaxValidity(ctx),
    detectImportResolution(ctx),
    detectRlsNewTables(ctx),
    detectAuthRouteAuth(ctx),
    detectHardcodedEnv(ctx),
    detectExternalPackageDeps(ctx),
    detectSqlSyntaxBasic(ctx),
    detectLargeFile(ctx),
    detectArtifactIntegrity(ctx),
    detectContextFreshness(ctx),
    detectSoulIntegrity(ctx),
    detectPathFormat(ctx),
  ].filter((check): check is SubmissionCheckResult => check !== null);

  return [...gate1, ...runPhase0Detectors(ctx)];
}
