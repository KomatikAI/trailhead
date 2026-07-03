// Phase B2 — autofix allowlist (pure module; execution lives in app/fixer.ts).
export const RED_LANE_GLOBS = [
    "**/migrations/**",
    "**/*.sql",
    "**/rls/**",
    "src/auth/**",
    "app/**/auth/**",
    ".github/workflows/**",
    "agents/*/SOUL.md",
    "src/risk-engine.ts",
    "**/secrets/**",
    "**/payments/**",
];
const ALLOWED_AUTOFIX_CLASSES = new Set([
    "format",
    "lint",
    "import-fix",
    "test-scaffold",
    "doc-update",
    "dependency-bump",
]);
function escapeRegexChar(ch) {
    return /[\\^$+?.()|{}[\]]/.test(ch) ? `\\${ch}` : ch;
}
function globToRegex(glob) {
    let src = "^";
    for (let i = 0; i < glob.length; i++) {
        const c = glob.charAt(i);
        if (c === "*") {
            if (glob[i + 1] === "*") {
                src += ".*";
                i++;
            }
            else {
                src += "[^/]*";
            }
        }
        else if (c === ".") {
            src += "\\.";
        }
        else {
            src += escapeRegexChar(c);
        }
    }
    src += "$";
    return new RegExp(src);
}
function matchesGlob(path, glob) {
    const normalized = path.replace(/\\/g, "/");
    if (glob.endsWith("/**")) {
        const prefix = glob.slice(0, -3).replace(/\*\*/g, "");
        return normalized.includes(prefix);
    }
    if (glob.includes("*")) {
        return globToRegex(glob).test(normalized);
    }
    return normalized.includes(glob);
}
export function isRedLanePath(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    return RED_LANE_GLOBS.some((glob) => matchesGlob(normalized, glob));
}
export function isAutofixClassAllowed(autofixClass) {
    return ALLOWED_AUTOFIX_CLASSES.has(autofixClass);
}
export function buildAutofixPlan(fixes) {
    const items = [];
    const blocked = [];
    for (const fix of fixes) {
        if (!fix.autofix_eligible || !fix.autofix_class)
            continue;
        if (!isAutofixClassAllowed(fix.autofix_class)) {
            blocked.push({
                fix,
                reason: `Autofix class not allowlisted: ${fix.autofix_class}`,
            });
            continue;
        }
        const touchFiles = fix.files.length > 0 ? fix.files : ["."];
        const redLane = touchFiles.filter(isRedLanePath);
        if (redLane.length > 0) {
            blocked.push({
                fix,
                reason: `Red-lane paths forbid autofix: ${redLane.join(", ")}`,
            });
            continue;
        }
        items.push({
            fix,
            files: touchFiles,
            autofix_class: fix.autofix_class,
        });
    }
    return { items, blocked };
}
/** Max one fix commit per gate round (Phase B2). */
export function selectAutofixCommit(plan) {
    return plan.items[0] ?? null;
}
