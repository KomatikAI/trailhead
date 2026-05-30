// Default submission detector policy data (Komatik fleet rename vocabulary).

export interface RenamePatternEntry {
  oldName: string;
  newName: string;
  pattern: RegExp;
}

export const DEFAULT_RENAME_PATTERNS: RenamePatternEntry[] = [
  { oldName: "DeployGuard", newName: "Trailhead", pattern: /\bDeployGuard\b/g },
  { oldName: "Daydream Studio", newName: "Sundog", pattern: /\bDaydream Studio\b/g },
  {
    oldName: "Storyboard Studio",
    newName: "Kindling",
    pattern: /\bStoryboard Studio\b/g,
  },
  { oldName: "Cognitive Debt", newName: "Drift", pattern: /\bCognitive Debt\b/g },
  { oldName: "cognitive-debt", newName: "Drift", pattern: /\bcognitive-debt\b/g },
  { oldName: "Undercurrent", newName: "Slipstream", pattern: /\bUndercurrent\b/g },
  { oldName: "Yggdrasil", newName: "Cairn", pattern: /\bYggdrasil\b/g },
  { oldName: "Bored", newName: "Lodge", pattern: /\bBored\b/g },
  { oldName: "Forge", newName: "Pack", pattern: /\bForge\b/g },
];

/** @deprecated use DEFAULT_RENAME_PATTERNS */
export const OLD_NAME_PATTERNS = DEFAULT_RENAME_PATTERNS;

export const DEFAULT_SLUG_ONLY_PATTERN_SOURCES = [
  "\\bcognitive-debt\\b",
  "\\bstoryboard-studio\\b",
  "\\bdaydream-studio\\b",
  "\\bshadow-ai-governance\\b",
];

export const DEFAULT_ARTIFACT_FILE_GLOBS = ["**/*.{ts,tsx,js,jsx,mjs,cjs}"];

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compileRenamePattern(
  oldName: string,
  newName: string,
): RenamePatternEntry {
  return {
    oldName,
    newName,
    pattern: new RegExp(`\\b${escapeRegexLiteral(oldName)}\\b`, "g"),
  };
}

export function compileSlugOnlyPatterns(sources: string[]): RegExp[] {
  return sources.map((source) => new RegExp(source, "i"));
}
