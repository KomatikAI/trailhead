// Claim Anchoring detector (ADR-010) — doc assertions should cite where they're true.
//
// Incident #3: a doc asserted "redirects exist" while the live canonical path had
// none — the claim outlived the code. This detector flags assertive, *behavioral*
// claims added to docs that carry no anchor (a file/path reference, a link, or a
// `verified-by:` / `see:` pointer). It does NOT judge whether the claim is true —
// it asks the author to point at where it's enforced/tested, so the claim and the
// code can be cross-checked later. Advisory only (per ADR-008): informational, no
// block. Self-heal follow-up: comment + open a test stub for the claim.

import type { SubmissionCheckResult } from "../types.js";
import type { SubmissionCheckContext, SubmissionFileInfo } from "./types.js";
import { fileContent, normalizePath } from "./helpers.js";

const DOC_FILE = /\.mdx?$/i;

// High-signal, behavioral, testable assertions. Kept tight to limit noise.
const CLAIM_PATTERNS: RegExp[] = [
  /\bredirects?\s+(?:exist|are\s+in\s+place|are\s+configured|are\s+handled)\b/i,
  /\bis\s+(?:enforced|guaranteed|wired\s+up|fully\s+covered)\b/i,
  /\b(?:always|never)\s+(?:redirects?|returns?|blocks?|allows?|runs?|fires?|resolves?)\b/i,
  /\bfully\s+(?:covered|tested|implemented|wired)\b/i,
  /\b(?:every|all)\s+\w+\s+(?:are\s+)?(?:redirected|covered|validated|enforced)\b/i,
  /\bguaranteed\s+to\b/i,
];

// An anchor lets a reviewer cross-check the claim against reality.
const ANCHOR_PATTERNS: RegExp[] = [
  /`[^`]*[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|sql|ya?ml|json|py|go|rs)`/i, // code/path in backticks
  /`[^`]*\/[^`]*`/, // any path-ish backtick span
  /\]\([^)]+\)/, // markdown link
  /\b(?:verified[ -]by|tested in|see|ref|test)\s*[:=]/i, // explicit pointer
  /<!--\s*claim-ok/i, // author override
];

function isDocFile(file: SubmissionFileInfo): boolean {
  return DOC_FILE.test(normalizePath(file.filename));
}

function hasAnchor(window: string): boolean {
  return ANCHOR_PATTERNS.some((re) => re.test(window));
}

interface Unanchored {
  file: string;
  line: number;
  text: string;
}

export function detectClaimAnchoring(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const docs = ctx.files.filter(isDocFile);
  if (docs.length === 0) return null;

  const unanchored: Unanchored[] = [];
  for (const file of docs) {
    const content = fileContent(file);
    if (!content) continue;
    const lines = content.split("\n");
    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue; // claims inside code examples aren't doc assertions

      if (!CLAIM_PATTERNS.some((re) => re.test(line))) continue;

      // Anchor may sit on the claim line or an adjacent line.
      const windowText = [lines[i - 1] ?? "", line, lines[i + 1] ?? ""].join("\n");
      if (hasAnchor(windowText)) continue;

      unanchored.push({
        file: normalizePath(file.filename),
        line: i + 1,
        text: line.trim().slice(0, 120),
      });
    }
  }

  if (unanchored.length === 0) return null;

  const shown = unanchored.slice(0, 8);
  const lines = shown.map((u) => `${u.file}:${u.line} — "${u.text}"`);
  const more =
    unanchored.length > shown.length
      ? ` (+${unanchored.length - shown.length} more)`
      : "";

  return {
    code: "claim_anchoring",
    severity: "advisory",
    title: "Behavioral claim in docs has no anchor",
    detail:
      `Assertive claims with no reference to where they're enforced/tested: ${lines.join(
        "; ",
      )}${more}. ` +
      "Cite the code/test (a backtick path, a link, or `verified-by:`), or add `<!-- claim-ok -->` if intentional.",
    files: [...new Set(unanchored.map((u) => u.file))],
    suggested_action:
      "Anchor each claim to where it lives (e.g. `proxy.ts`, a test path, or a link), " +
      "so docs and reality can be cross-checked. This is the doc-vs-reality drift that let " +
      '"redirects exist" outlive the missing /apps redirect.',
    autofix_eligible: false,
  };
}
