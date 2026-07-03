// Gate 1 detectors (patch/content based).
import { addedLines, extensionOf, extractAllImports, fileContent, isStaleArchivedPath, isTestPath, lineCountFromPatch, linesForFreshnessScan, normalizePath, scanAddedContent, } from "./helpers.js";
import { runPhase0Detectors } from "./phase0-detectors.js";
import { detectContractIntegrity } from "./contract-integrity.js";
import { detectSafeDeprecation } from "./safe-deprecation.js";
import { detectDestructiveChange } from "./destructive-change.js";
import { detectClaimAnchoring } from "./claim-anchoring.js";
import { detectPromotionCoherence } from "./promotion-coherence.js";
import { validateFileSyntax } from "./syntax-validity.js";
import { matchesGlobs } from "../risk-engine.js";
import { applyDetectorPolicy, artifactFileGlobs } from "./detector-policy.js";
export { DEFAULT_RENAME_PATTERNS, OLD_NAME_PATTERNS } from "./policy-defaults.js";
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
const SECRET_PATTERNS = [
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
const HARDCODED_ENV_PATTERNS = [
    { name: "localhost with port", pattern: /(?:['"`])localhost:\d{2,5}(?:['"`])/g },
    {
        name: "hardcoded private IP",
        pattern: /(?:['"`])(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(?::\d+)?(?:['"`])/g,
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
function result(partial) {
    return { autofix_eligible: false, ...partial };
}
export function detectMockPlaceholder(ctx) {
    const hits = scanAddedContent(ctx.files, (line, filename) => {
        if (isTestPath(filename))
            return false;
        if (/\.(md|txt)$/i.test(filename))
            return false;
        return MOCK_PATTERNS.some((re) => {
            re.lastIndex = 0;
            return re.test(line);
        });
    });
    if (hits.length === 0)
        return null;
    return result({
        code: "mock_placeholder",
        severity: "blocking",
        title: "Mock placeholder in production path",
        detail: `Found mock/TODO placeholder patterns in ${hits.join(", ")}.`,
        files: hits,
        suggested_action: "Remove mock placeholders and implement real behavior.",
    });
}
export function detectSecrets(ctx) {
    const hits = scanAddedContent(ctx.files, (line) => SECRET_PATTERNS.some((entry) => {
        entry.pattern.lastIndex = 0;
        return entry.pattern.test(line);
    }));
    if (hits.length === 0)
        return null;
    return result({
        code: "secrets",
        severity: "blocking",
        title: "Potential secret in diff",
        detail: `Added lines match secret patterns in ${hits.join(", ")}.`,
        files: hits,
        suggested_action: "Remove secrets; use environment variables or a secret manager.",
    });
}
export function detectDestructiveSql(ctx) {
    const sqlFiles = ctx.files.filter((f) => extensionOf(f.filename) === ".sql");
    const hits = scanAddedContent(sqlFiles, (line) => /\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM(?![^\n]*\bWHERE\b))/i.test(line));
    if (hits.length === 0)
        return null;
    return result({
        code: "destructive_sql",
        severity: "blocking",
        title: "Destructive SQL in migration",
        detail: `Added SQL contains destructive statements in ${hits.join(", ")}.`,
        files: hits,
        suggested_action: "Use additive migrations; avoid DROP/TRUNCATE without human approval.",
    });
}
// Only code files can carry hard file references; prose (.md/.mdx/.txt) merely
// *mentions* paths and was the dominant artifact_integrity false-positive source.
const ARTIFACT_BARE_IGNORE = new Set([
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "readme.md",
]);
export function detectArtifactIntegrity(ctx) {
    const referenced = new Set();
    const fileGlobs = artifactFileGlobs(ctx.detectorPolicy);
    const pathIgnore = ctx.detectorPolicy.artifact_integrity?.pathIgnore ?? [];
    // Only treat a path *literal* inside an import/require/export-from statement
    // as a hard reference — natural-language "see X" / "fix Y" / "update Z" in
    // prose is not a code dependency (the old prose trigger over-flagged docs).
    const importRefPattern = /(?:\bimport\b|\bfrom\b|\brequire\s*\(|\bexport\b[^'"`]*\bfrom\b)\s*['"`]([\w@./-]+\.(?:ts|tsx|js|jsx|sql|yml|yaml|json))['"`]/g;
    for (const file of ctx.files) {
        if (!matchesGlobs(file.filename, fileGlobs))
            continue;
        if (pathIgnore.length > 0 && matchesGlobs(file.filename, pathIgnore))
            continue;
        for (const line of addedLines(file.patch)) {
            importRefPattern.lastIndex = 0;
            for (const match of line.matchAll(importRefPattern)) {
                const candidate = match[1]?.replace(/^\.\//, "");
                if (!candidate || candidate.includes("*"))
                    continue;
                if (candidate.startsWith("node:"))
                    continue;
                // Skip bare, repo-ubiquitous manifest names (package.json, etc.).
                const base = candidate.split("/").pop()?.toLowerCase() ?? "";
                if (!candidate.includes("/") && ARTIFACT_BARE_IGNORE.has(base))
                    continue;
                if (!ctx.prPaths.has(candidate)) {
                    referenced.add(candidate);
                }
            }
        }
    }
    if (referenced.size === 0)
        return null;
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
function isNamingAllowlisted(filename, line, allowlist = {}, slugOnlyPatterns = []) {
    const trimmed = line.trim();
    const path = normalizePath(filename);
    const ext = extensionOf(filename);
    const skipExtensions = allowlist.skip_extensions ?? [".sql"];
    const skipPathPatterns = allowlist.skip_path_patterns ?? ["migrations/", "schema/"];
    const skipCommentMarkers = allowlist.skip_comment_markers ?? [
        "historical:",
        "migration:",
        "deprecated:",
    ];
    if (allowlist.skip_in_imports !== false &&
        /^import\s|^from\s|require\(/.test(trimmed)) {
        return true;
    }
    if (skipExtensions.includes(ext))
        return true;
    if (skipPathPatterns.some((pattern) => path.includes(pattern)))
        return true;
    if (skipCommentMarkers.some((marker) => trimmed.toLowerCase().includes(marker.toLowerCase()))) {
        return true;
    }
    if (/\/memory\//.test(path))
        return true;
    if (/RESEARCH\.md$|BRAND\.md$|CHANGELOG\.md$/.test(path))
        return true;
    if (/^\[.*\]\(.*\)/.test(trimmed) || /\]\(http/.test(trimmed))
        return true;
    if (slugOnlyPatterns.some((p) => p.test(trimmed)) &&
        !/[A-Z]/.test(trimmed.match(/(?:cognitive-debt|storyboard-studio|daydream-studio|shadow-ai-governance)/)?.[0] ?? "")) {
        return true;
    }
    if (/["'`/]/.test(trimmed)) {
        const inStringOrPath = /["'`/][^"'`]*(?:deployguard|storyboard-studio|daydream-studio|cognitive-debt|shadow-ai-governance|komatik-yggdrasil)[^"'`]*["'`/]/i;
        if (inStringOrPath.test(trimmed))
            return true;
    }
    return false;
}
export function detectContextFreshness(ctx) {
    if (ctx.staleTerms.length === 0 && ctx.renamePatterns.length === 0) {
        return null;
    }
    const hits = [];
    for (const file of ctx.files) {
        if (isStaleArchivedPath(file.filename, ctx.pathIgnorePatterns))
            continue;
        for (const line of linesForFreshnessScan(file)) {
            if (isNamingAllowlisted(file.filename, line, ctx.namingAllowlist, ctx.slugOnlyPatterns)) {
                continue;
            }
            for (const term of ctx.staleTerms) {
                if (line.toLowerCase().includes(term.toLowerCase()))
                    hits.push(file.filename);
            }
            for (const entry of ctx.renamePatterns) {
                entry.pattern.lastIndex = 0;
                if (entry.pattern.test(line))
                    hits.push(file.filename);
            }
        }
    }
    const unique = [...new Set(hits)];
    if (unique.length === 0)
        return null;
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
export function detectPathFormat(ctx) {
    if (!ctx.komatikInstance)
        return null;
    // A path that leaks a repo-name prefix before the canonical
    // agents/<id>/suggestions/… convention is malformed. Use the configured home
    // repo if set, otherwise match any repo-name segment generically — no
    // hardcoded org repo.
    const repoPrefixed = ctx.agentRepo
        ? new RegExp(`^${ctx.agentRepo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/agents/`)
        : /^[a-z][a-z0-9-]*\/agents\/[a-z][a-z0-9-]*\/suggestions\//;
    const hits = ctx.files
        .map((f) => normalizePath(f.filename))
        .filter((name) => repoPrefixed.test(name) ||
        /\/agents\/agents\//.test(name) ||
        (!/^agents\/[a-z][a-z0-9-]*\/suggestions\//.test(name) &&
            /\/suggestions\//.test(name) &&
            !name.startsWith("agents/")));
    if (hits.length === 0)
        return null;
    return result({
        code: "path_format",
        severity: "warn",
        title: "Suspicious agent suggestion path",
        detail: `Paths should match agents/<id>/suggestions/<project>/… — found: ${hits.join(", ")}.`,
        files: hits,
        suggested_action: "Use canonical agent suggestion paths without repo prefix.",
    });
}
export function detectHardcodedEnv(ctx) {
    const hits = scanAddedContent(ctx.files, (line, filename) => {
        if (/\.(md|txt)$/i.test(filename))
            return false;
        if (/^\s*\/\/|^\s*\*|^\s*#/.test(line))
            return false;
        return HARDCODED_ENV_PATTERNS.some((entry) => {
            entry.pattern.lastIndex = 0;
            return entry.pattern.test(line);
        });
    });
    if (hits.length === 0)
        return null;
    return result({
        code: "hardcoded_env",
        severity: "blocking",
        title: "Hardcoded environment value",
        detail: `Added lines contain hardcoded localhost/IP patterns in ${hits.join(", ")}.`,
        files: hits,
        suggested_action: "Use environment variables or configuration instead of hardcoded hosts.",
    });
}
export function detectLargeFile(ctx) {
    const hits = ctx.files
        .filter((file) => {
        const lines = typeof file.content === "string"
            ? file.content.split("\n").length
            : lineCountFromPatch(file.patch);
        return lines > ctx.maxFileLines;
    })
        .map((f) => f.filename);
    if (hits.length === 0)
        return null;
    return result({
        code: "large_file",
        severity: "warn",
        title: "Large file in PR",
        detail: `Files exceed ${ctx.maxFileLines} lines: ${hits.join(", ")}.`,
        files: hits,
        suggested_action: "Split large changes into smaller PRs.",
    });
}
function extractRelativeImports(content) {
    const imports = [];
    const patterns = [
        /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?['"](\.\.?[^'"]+)['"]/g,
        /\brequire\(\s*['"](\.\.?[^'"]+)['"]\s*\)/g,
    ];
    for (const pattern of patterns) {
        for (const match of content.matchAll(pattern)) {
            if (match[1])
                imports.push(match[1]);
        }
    }
    return imports;
}
function resolveRelativeImport(fromFile, specifier, prPaths) {
    const clean = specifier.split("?")[0].split("#")[0];
    const baseDir = normalizePath(fromFile).split("/").slice(0, -1);
    const segments = clean.replace(/^\.\//, "").split("/");
    for (const segment of segments) {
        if (segment === "..")
            baseDir.pop();
        else if (segment !== ".")
            baseDir.push(segment);
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
export function detectImportResolution(ctx) {
    // Resolving relative imports needs repo ground truth: an import to an existing,
    // UNCHANGED sibling (not in this PR's diff) is valid but looks "unresolved" if we
    // only check changed files — a blocking false positive. Without repoPaths we can't
    // tell that from a fabricated path, so stay dormant (the repoPaths convention used
    // by the other existence-dependent detectors).
    if (!ctx.repoPaths)
        return null;
    const codeExts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
    const known = new Set([...ctx.prPaths, ...ctx.repoPaths]);
    const hits = [];
    for (const file of ctx.files) {
        if (!codeExts.has(extensionOf(file.filename)))
            continue;
        const content = fileContent(file);
        for (const specifier of extractRelativeImports(content)) {
            if (!resolveRelativeImport(file.filename, specifier, known)) {
                hits.push(file.filename);
                break;
            }
        }
    }
    if (hits.length === 0)
        return null;
    return result({
        code: "import_resolution",
        severity: "blocking",
        title: "Unresolved relative import",
        detail: `Relative imports could not be resolved within this PR: ${[...new Set(hits)].join(", ")}.`,
        files: [...new Set(hits)],
        suggested_action: "Add missing files to the PR or fix import paths.",
    });
}
export function detectRlsNewTables(ctx) {
    const sqlFiles = ctx.files.filter((f) => extensionOf(f.filename) === ".sql");
    const corpus = sqlFiles.map((f) => fileContent(f)).join("\n");
    const hits = [];
    const createTable = /\bCREATE\s+(?!TEMP(?:ORARY)?\s+)TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"?[A-Za-z_][\w$]*"?\.)?"?[A-Za-z_][\w$]*"?)/gi;
    for (const file of sqlFiles) {
        const content = fileContent(file);
        for (const match of content.matchAll(createTable)) {
            const table = match[1]?.replace(/"/g, "") ?? "";
            const pattern = new RegExp(`ALTER\\s+TABLE\\s+(?:ONLY\\s+)?["']?${table.split(".").pop()}["']?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
            if (!pattern.test(corpus))
                hits.push(file.filename);
        }
    }
    if (hits.length === 0)
        return null;
    return result({
        code: "rls_new_tables",
        severity: "blocking",
        title: "New table missing RLS",
        detail: `CREATE TABLE without ENABLE ROW LEVEL SECURITY in ${[...new Set(hits)].join(", ")}.`,
        files: [...new Set(hits)],
        suggested_action: "Add ALTER TABLE ... ENABLE ROW LEVEL SECURITY for every new table.",
    });
}
function isRouteAllowlisted(path, allowlist) {
    return allowlist.some((entry) => path.includes(entry.replace(/^\//, "")));
}
export function detectAuthRouteAuth(ctx) {
    const routePattern = /(?:^|\/)(?:app\/api\/.+\/route|pages\/api\/.+)\.(?:ts|tsx|js|jsx)$/;
    const authPattern = /\b(getUser|getSession|getServerSession|auth|requireAuth|withAuth)\s*\(/;
    const hits = [];
    for (const file of ctx.files) {
        const normalized = normalizePath(file.filename);
        if (!routePattern.test(normalized))
            continue;
        if (isRouteAllowlisted(normalized, ctx.authRouteAllowlist))
            continue;
        if (!authPattern.test(fileContent(file)))
            hits.push(normalized);
    }
    if (hits.length === 0)
        return null;
    return result({
        code: "auth_route_auth",
        severity: "blocking",
        title: "API route missing auth check",
        detail: `Routes appear to lack session/user verification: ${hits.join(", ")}.`,
        files: hits,
        suggested_action: "Verify authenticated user before handling the request.",
    });
}
function packageNameFromSpecifier(specifier) {
    if (specifier.startsWith("@"))
        return specifier.split("/").slice(0, 2).join("/");
    return specifier.split("/")[0];
}
function isNodeBuiltin(specifier) {
    const bare = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
    return NODE_BUILTINS.has(bare.split("/")[0]);
}
export function detectExternalPackageDeps(ctx) {
    if (ctx.declaredPackages.size === 0)
        return null;
    const codeExts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
    const hits = [];
    for (const file of ctx.files) {
        if (!codeExts.has(extensionOf(file.filename)))
            continue;
        for (const imp of extractAllImports(fileContent(file))) {
            const specifier = imp.specifier;
            if (specifier.startsWith(".") || specifier.startsWith("/"))
                continue;
            if (specifier.startsWith("@/") || specifier.startsWith("~/"))
                continue;
            if (specifier.startsWith("http:") || specifier.startsWith("https:"))
                continue;
            if (isNodeBuiltin(specifier))
                continue;
            const pkg = packageNameFromSpecifier(specifier);
            if (!ctx.declaredPackages.has(pkg))
                hits.push(`${file.filename} → ${pkg}`);
        }
    }
    if (hits.length === 0)
        return null;
    return result({
        code: "external_package_deps",
        severity: "warn",
        title: "Undeclared package import",
        detail: hits.slice(0, 6).join("; "),
        files: [...new Set(hits.map((h) => h.split(" → ")[0]))],
        suggested_action: "Add the package to package.json or remove the import.",
    });
}
function stripSqlComments(content) {
    return content.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
function countPlpgsqlBlockBegins(sql) {
    const re = /\bBEGIN\b(?!\s+(?:TRANSACTION|WORK)\b)/gi;
    return (sql.match(re) || []).length;
}
function countPlpgsqlBlockEnds(sql) {
    const re = /\bEND\s*(?!IF\b|LOOP\b|CASE\b)\s*(?:;|\$\$)/gi;
    return (sql.match(re) || []).length;
}
export function detectSqlSyntaxBasic(ctx) {
    const hits = [];
    for (const file of ctx.files.filter((f) => extensionOf(f.filename) === ".sql")) {
        const stripped = stripSqlComments(fileContent(file));
        const beginCount = countPlpgsqlBlockBegins(stripped);
        const endCount = countPlpgsqlBlockEnds(stripped);
        if (beginCount > 0 && beginCount > endCount)
            hits.push(file.filename);
    }
    if (hits.length === 0)
        return null;
    return result({
        code: "sql_syntax_basic",
        severity: "warn",
        title: "SQL block balance issue",
        detail: `Possible unclosed BEGIN block in ${hits.join(", ")}.`,
        files: hits,
        suggested_action: "Verify PL/pgSQL block structure before merging.",
    });
}
export function detectSyntaxValidity(ctx) {
    const errors = [];
    for (const file of ctx.files) {
        // Real parsers need the whole file — skip patch-only inputs (PR diff fragments).
        if (typeof file.content !== "string")
            continue;
        const message = validateFileSyntax(file.filename, file.content);
        if (message)
            errors.push(`${file.filename}: ${message}`);
    }
    if (errors.length === 0)
        return null;
    return result({
        code: "syntax_validity",
        severity: "blocking",
        title: "Syntax error in submitted file",
        detail: errors.slice(0, 12).join("; "),
        files: errors.map((e) => e.split(": ")[0] ?? e),
        suggested_action: "Fix the parse error before submitting.",
    });
}
export function detectSoulIntegrity(ctx) {
    if (!ctx.komatikInstance)
        return null;
    const hits = ctx.files
        .map((f) => normalizePath(f.filename))
        .filter((name) => /^agents\/[a-z][a-z0-9-]*\/SOUL\.md$/.test(name));
    if (hits.length === 0)
        return null;
    return result({
        code: "soul_integrity",
        severity: "blocking",
        title: "Agent SOUL.md modified",
        detail: `SOUL changes require human review: ${hits.join(", ")}.`,
        files: hits,
        suggested_action: "Revert SOUL.md changes or request explicit human approval.",
    });
}
export function runAllDetectors(ctx) {
    const policy = ctx.detectorPolicy;
    const finalize = (code, check) => applyDetectorPolicy(code, check, policy);
    const gate1 = [
        finalize("mock_placeholder", detectMockPlaceholder(ctx)),
        finalize("secrets", detectSecrets(ctx)),
        finalize("destructive_sql", detectDestructiveSql(ctx)),
        finalize("syntax_validity", detectSyntaxValidity(ctx)),
        finalize("import_resolution", detectImportResolution(ctx)),
        finalize("rls_new_tables", detectRlsNewTables(ctx)),
        finalize("auth_route_auth", detectAuthRouteAuth(ctx)),
        finalize("hardcoded_env", detectHardcodedEnv(ctx)),
        finalize("external_package_deps", detectExternalPackageDeps(ctx)),
        finalize("sql_syntax_basic", detectSqlSyntaxBasic(ctx)),
        finalize("large_file", detectLargeFile(ctx)),
        finalize("artifact_integrity", detectArtifactIntegrity(ctx)),
        finalize("context_freshness", detectContextFreshness(ctx)),
        finalize("soul_integrity", detectSoulIntegrity(ctx)),
        finalize("path_format", detectPathFormat(ctx)),
        finalize("contract_integrity", detectContractIntegrity(ctx)),
        finalize("safe_deprecation", detectSafeDeprecation(ctx)),
        finalize("destructive_change", detectDestructiveChange(ctx)),
        finalize("claim_anchoring", detectClaimAnchoring(ctx)),
        finalize("promotion_coherence", detectPromotionCoherence(ctx)),
    ].filter((check) => check !== null);
    const phase0 = runPhase0Detectors(ctx)
        .map((check) => finalize(check.code, check))
        .filter((check) => check !== null);
    return [...gate1, ...phase0];
}
