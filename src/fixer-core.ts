// Phase B2 — autofix allowlist (pure module; execution lives in app/fixer.ts).

import type { RemediationAutofixClass, RemediationFix } from "./types.js";

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

const ALLOWED_AUTOFIX_CLASSES = new Set<RemediationAutofixClass>([
  "format",
  "lint",
  "import-fix",
  "test-scaffold",
  "doc-update",
  "dependency-bump",
]);

export interface AutofixPlanItem {
  fix: RemediationFix;
  files: string[];
  autofix_class: RemediationAutofixClass;
}

export interface AutofixPlan {
  items: AutofixPlanItem[];
  blocked: Array<{ fix: RemediationFix; reason: string }>;
}

function matchesGlob(path: string, glob: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (glob.endsWith("/**")) {
    const prefix = glob.slice(0, -3);
    return normalized.includes(prefix.replace(/\*\*/g, ""));
  }
  if (glob.includes("*")) {
    const re = new RegExp(
      `^${glob.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\./g, "\\.")}$`,
    );
    return re.test(normalized);
  }
  return normalized.includes(glob);
}

export function isRedLanePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return RED_LANE_GLOBS.some((glob) => matchesGlob(normalized, glob));
}

export function isAutofixClassAllowed(autofixClass: RemediationAutofixClass): boolean {
  return ALLOWED_AUTOFIX_CLASSES.has(autofixClass);
}

export function buildAutofixPlan(fixes: RemediationFix[]): AutofixPlan {
  const items: AutofixPlanItem[] = [];
  const blocked: AutofixPlan["blocked"] = [];

  for (const fix of fixes) {
    if (!fix.autofix_eligible || !fix.autofix_class) continue;

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
export function selectAutofixCommit(plan: AutofixPlan): AutofixPlanItem | null {
  return plan.items[0] ?? null;
}
