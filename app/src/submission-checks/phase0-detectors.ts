// Phase 0 agent suggestion checks (weight=0 / advisory in Trailhead).
// Ported from komatik-agents agent-gate-checks Phase 0 stubs with real heuristics.

import type { SubmissionCheckResult } from "../types.js";
import type { SubmissionCheckContext, SubmissionFileInfo } from "./types.js";
import { fileContent, normalizePath } from "./helpers.js";

const SEVERITY = "advisory" as const;
const OUTPUT_SIZE_MIN_CHARS = 400;
const NARRATIVE_MATCH_THRESHOLD = 3;

const PREAMBLE_OPENERS =
  /^(let me|here is the|here's the|i('| wi)ll|after reviewing|to start|based on my analysis)/i;
const SESSION_NARRATIVE =
  /\bI (queried|reviewed|checked|will (build|create|fix|implement|add|update))/gi;
const PARTIAL_COMPLETION = /\b\d+\s*(?:\/|of)\s*\d+\b/i;
const INCOMPLETE_MARKER = /\b(INCOMPLETE|PARTIAL)\b/i;
const FABRICATED_ID = /\b(session|run|task|message)[-_]?[a-f0-9]{6,}\b/gi;
const FILE_REF =
  /(?:^|[\s('"`])((?:src|scripts|supabase|app|agents)\/[a-z0-9_/.-]+\.(?:ts|tsx|js|mjs|sql|py|md))/gi;
const ACTION_SUFFIX = /(?:→\s*@[\w-]+|— No actions surfaced)\s*$/i;
const UNVERIFIED_MARKER = /\[UNVERIFIED\]|verify after|needs verification/i;
const OWNER_DUE = /Owner:\s*@[\w-]+[\s\S]{0,120}Due:\s*\d{4}-\d{2}-\d{2}/i;
const FIX_CLAIM = /\b(fix applied|now working|is live|deployed successfully)\b/i;
const MULTI_PHASE = /\bphase\s+[ab12]\b/i;
const DEP_MATRIX = /\b(depends on:|dependency matrix|blocks:|x blocks y)\b/i;
const RUNBOOK_HINT = /runbook|deploy(?:ment)? guide/i;
const SECRETS_PREREQ =
  /\b(secrets list|prerequisites:|required env|environment variables)\b/i;
const PROPOSAL_ONLY = /\bPROPOSAL_ONLY\b/i;
const SCHEMA_LINK = /https?:\/\/[^\s)]+\/(schema|openapi|api-docs)/i;

function advisory(
  partial: Omit<SubmissionCheckResult, "severity" | "autofix_eligible">,
): SubmissionCheckResult {
  return { severity: SEVERITY, autofix_eligible: false, ...partial };
}

export function suggestionMarkdownFiles(
  ctx: SubmissionCheckContext,
): SubmissionFileInfo[] {
  return ctx.files.filter((file) => {
    const path = normalizePath(file.filename);
    if (!/\.md$/i.test(path)) return false;
    return /agents\/[^/]+\/suggestions\//.test(path) || /\/suggestions\//.test(path);
  });
}

function agentFromPath(filePath: string): string | null {
  const match = normalizePath(filePath).match(/^agents\/([^/]+)\//);
  return match?.[1] ?? null;
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^#+\s/.test(p));
}

function extractFileRefs(text: string): string[] {
  const refs = new Set<string>();
  const re = new RegExp(FILE_REF.source, FILE_REF.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) refs.add(normalizePath(m[1]));
  }
  const backtick = /`((?:src|scripts|supabase|app|agents)\/[a-z0-9_/.-]+\.[a-z]+)`/gi;
  while ((m = backtick.exec(text)) !== null) {
    refs.add(normalizePath(m[1]));
  }
  return [...refs];
}

function hasToBeCreatedMarker(text: string, ref: string): boolean {
  const idx = text.indexOf(ref);
  if (idx < 0) return false;
  const window = text.slice(Math.max(0, idx - 80), idx + ref.length + 80);
  return /to-be-created|to be created|TBD path/i.test(window);
}

export function detectOutputSizeMin(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const files = suggestionMarkdownFiles(ctx);
  const short = files.filter((f) => fileContent(f).trim().length < OUTPUT_SIZE_MIN_CHARS);
  if (short.length === 0) return null;
  return advisory({
    code: "output_size_min",
    title: "Agent output below minimum size",
    detail: `Suggestion markdown under ${OUTPUT_SIZE_MIN_CHARS} chars (possible model bail-out): ${short.map((f) => f.filename).join(", ")}.`,
    files: short.map((f) => f.filename),
    suggested_action: "Expand the proposal with concrete actions and file-level detail.",
  });
}

export function detectActionExtractionPresent(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const files = suggestionMarkdownFiles(ctx).filter(
    (f) => agentFromPath(f.filename) === "coordinator",
  );
  const missing: string[] = [];
  for (const file of files) {
    const paras = paragraphs(fileContent(file));
    const bad = paras.filter((p) => !ACTION_SUFFIX.test(p));
    if (bad.length > 0) missing.push(file.filename);
  }
  if (missing.length === 0) return null;
  return advisory({
    code: "action_extraction_present",
    title: "Coordinator paragraph missing action extraction",
    detail: `Paragraphs should end with "→ @owner" or "— No actions surfaced": ${missing.join(", ")}.`,
    files: missing,
    suggested_action: "Add explicit owner routing or a no-actions line per paragraph.",
  });
}

export function detectDeltaSectionPresent(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const files = suggestionMarkdownFiles(ctx).filter((f) => {
    const agent = agentFromPath(f.filename);
    const path = normalizePath(f.filename);
    return agent === "knowledge-scout" || /DAILY-INTEL\.md$/i.test(path);
  });
  const missing: string[] = [];
  for (const file of files) {
    const text = fileContent(file);
    if (!/## Δ Since Last Sweep/i.test(text) && !/No deltas — quiet sweep/i.test(text)) {
      missing.push(file.filename);
    }
  }
  if (missing.length === 0) return null;
  return advisory({
    code: "delta_section_present",
    title: "Missing delta section (knowledge-scout)",
    detail: `Require "## Δ Since Last Sweep" or "No deltas — quiet sweep": ${missing.join(", ")}.`,
    files: missing,
    suggested_action: "Add a delta header or explicit quiet-sweep line.",
  });
}

export function detectPreambleAbsent(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const hits: string[] = [];
  for (const file of suggestionMarkdownFiles(ctx)) {
    const paras = paragraphs(fileContent(file)).slice(0, 2);
    if (paras.some((p) => PREAMBLE_OPENERS.test(p.split("\n")[0]?.trim() ?? ""))) {
      hits.push(file.filename);
    }
  }
  if (hits.length === 0) return null;
  return advisory({
    code: "preamble_absent",
    title: "Conversational preamble detected",
    detail: `Opening paragraphs use session-style preambles: ${hits.join(", ")}.`,
    files: hits,
    suggested_action: "Start with structured content, not meta narration.",
  });
}

export function detectGraduationSignalsSectionPresent(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const files = suggestionMarkdownFiles(ctx).filter(
    (f) => agentFromPath(f.filename) === "rd-satellite",
  );
  const missing = files
    .filter((f) => !/## Graduation Signals/i.test(fileContent(f)))
    .map((f) => f.filename);
  if (missing.length === 0) return null;
  return advisory({
    code: "graduation_signals_section_present",
    title: "Missing Graduation Signals section",
    detail: `rd-satellite output requires "## Graduation Signals": ${missing.join(", ")}.`,
    files: missing,
    suggested_action: "Add a Graduation Signals section with promotion criteria.",
  });
}

export function detectFabricatedIdCheck(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const hits: string[] = [];
  const ids: string[] = [];
  for (const file of suggestionMarkdownFiles(ctx)) {
    const text = fileContent(file);
    const re = new RegExp(FABRICATED_ID.source, FABRICATED_ID.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      ids.push(m[0]);
      hits.push(file.filename);
    }
  }
  if (ids.length === 0) return null;
  return advisory({
    code: "fabricated_id_check",
    title: "Suspicious session/run identifiers",
    detail: `Verify identifiers against agent_runs/tasks/messages: ${[...new Set(ids)].slice(0, 8).join(", ")}.`,
    files: [...new Set(hits)],
    suggested_action: "Replace fabricated IDs with verified references or remove them.",
  });
}

export function detectSessionNarrativeDetection(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const hits: string[] = [];
  let total = 0;
  for (const file of suggestionMarkdownFiles(ctx)) {
    const text = fileContent(file);
    const re = new RegExp(SESSION_NARRATIVE.source, SESSION_NARRATIVE.flags);
    const matches = text.match(re);
    if (matches && matches.length > 0) {
      total += matches.length;
      hits.push(file.filename);
    }
  }
  if (total < NARRATIVE_MATCH_THRESHOLD) return null;
  return advisory({
    code: "session_narrative_detection",
    title: "Session narrative instead of file content",
    detail: `${total} first-person session phrases across ${hits.join(", ")}.`,
    files: hits,
    suggested_action: "Replace narration with concrete diffs, paths, and commands.",
  });
}

export function detectIncompletenessSelfFlag(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const hits: string[] = [];
  for (const file of suggestionMarkdownFiles(ctx)) {
    const text = fileContent(file);
    if (PARTIAL_COMPLETION.test(text) && !INCOMPLETE_MARKER.test(text)) {
      hits.push(file.filename);
    }
  }
  if (hits.length === 0) return null;
  return advisory({
    code: "incompleteness_self_flag",
    title: "Partial completion without INCOMPLETE marker",
    detail: `Fractional completion hints require INCOMPLETE/PARTIAL flag: ${hits.join(", ")}.`,
    files: hits,
    suggested_action: 'Add an explicit "INCOMPLETE" or "PARTIAL" marker for scoped work.',
  });
}

export function detectReferencedFilesExist(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const missing: string[] = [];
  for (const file of suggestionMarkdownFiles(ctx)) {
    const text = fileContent(file);
    for (const ref of extractFileRefs(text)) {
      const inPr =
        ctx.prPaths.has(ref) || [...ctx.prPaths].some((p) => p.endsWith(`/${ref}`));
      if (!inPr && !hasToBeCreatedMarker(text, ref)) {
        missing.push(`${file.filename}: ${ref}`);
      }
    }
  }
  if (missing.length === 0) return null;
  return advisory({
    code: "referenced_files_exist",
    title: "Referenced path not in PR",
    detail: missing.slice(0, 12).join("; "),
    files: missing.map((m) => m.split(": ")[0] ?? m),
    suggested_action: 'Include the file in the PR or mark adjacent "to-be-created".',
  });
}

export function detectPrerequisiteSecretsCheck(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const hits: string[] = [];
  for (const file of suggestionMarkdownFiles(ctx)) {
    const path = normalizePath(file.filename);
    const text = fileContent(file);
    const titleLine = text.split("\n").find((l) => /^#\s/.test(l)) ?? "";
    if (!RUNBOOK_HINT.test(`${path} ${titleLine}`)) continue;
    const head = text.split("\n").slice(0, 30).join("\n");
    if (!SECRETS_PREREQ.test(head)) hits.push(file.filename);
  }
  if (hits.length === 0) return null;
  return advisory({
    code: "prerequisite_secrets_check",
    title: "Runbook missing secrets prerequisite step",
    detail: `First 30 lines should include secrets/env prerequisites: ${hits.join(", ")}.`,
    files: hits,
    suggested_action: "Open runbooks with Prerequisites or `secrets list` verification.",
  });
}

export function detectDependencyDagValidation(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const hits: string[] = [];
  for (const file of suggestionMarkdownFiles(ctx)) {
    const text = fileContent(file);
    const phases = (text.match(/\bphase\s+[ab12]\b/gi) ?? []).length;
    if (phases >= 2 && !DEP_MATRIX.test(text)) {
      hits.push(file.filename);
    }
  }
  if (hits.length === 0) return null;
  return advisory({
    code: "dependency_dag_validation",
    title: "Multi-phase plan missing dependency matrix",
    detail: `Multi-phase proposals need Depends on / blocks lines: ${hits.join(", ")}.`,
    files: hits,
    suggested_action: "Add explicit phase dependencies (X blocks Y).",
  });
}

export function detectUncommittedFixCheck(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const hits: string[] = [];
  for (const file of suggestionMarkdownFiles(ctx)) {
    if (FIX_CLAIM.test(fileContent(file))) hits.push(file.filename);
  }
  if (hits.length === 0) return null;
  return advisory({
    code: "uncommitted_fix_check",
    title: "Fix claim requires commit verification",
    detail: `Claims like "fix applied" / "now working" need matching git history: ${hits.join(", ")}.`,
    files: hits,
    suggested_action:
      "Reference the commit SHA or flag changes as on-disk pending commit.",
  });
}

export function detectVerificationOwnerAssigned(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const hits: string[] = [];
  for (const file of suggestionMarkdownFiles(ctx)) {
    const lines = fileContent(file).split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!UNVERIFIED_MARKER.test(lines[i] ?? "")) continue;
      const window = lines.slice(i, i + 6).join("\n");
      if (!OWNER_DUE.test(window)) {
        hits.push(file.filename);
        break;
      }
    }
  }
  if (hits.length === 0) return null;
  return advisory({
    code: "verification_owner_assigned",
    title: "UNVERIFIED item missing owner and due date",
    detail: `Add Owner: @user and Due: YYYY-MM-DD near unverified items: ${[...new Set(hits)].join(", ")}.`,
    files: [...new Set(hits)],
    suggested_action: "Assign verification owner and due date for each UNVERIFIED line.",
  });
}

export function detectExternalInterfaceValidation(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const hits: string[] = [];
  for (const file of suggestionMarkdownFiles(ctx)) {
    const path = normalizePath(file.filename);
    const crossRepo = /suggestions\/(?!komatik-agents)[^/]+\//.test(path);
    if (!crossRepo) continue;
    const text = fileContent(file);
    if (!PROPOSAL_ONLY.test(text) && !SCHEMA_LINK.test(text)) {
      hits.push(file.filename);
    }
  }
  if (hits.length === 0) return null;
  return advisory({
    code: "external_interface_validation",
    title: "Cross-repo proposal lacks schema verification",
    detail: `Cross-repo suggestions need PROPOSAL_ONLY or verified schema link: ${hits.join(", ")}.`,
    files: hits,
    suggested_action: "Link verified target schema or mark PROPOSAL_ONLY.",
  });
}

export function runPhase0Detectors(ctx: SubmissionCheckContext): SubmissionCheckResult[] {
  if (suggestionMarkdownFiles(ctx).length === 0) return [];
  const checks = [
    detectOutputSizeMin,
    detectActionExtractionPresent,
    detectDeltaSectionPresent,
    detectPreambleAbsent,
    detectGraduationSignalsSectionPresent,
    detectFabricatedIdCheck,
    detectSessionNarrativeDetection,
    detectIncompletenessSelfFlag,
    detectReferencedFilesExist,
    detectPrerequisiteSecretsCheck,
    detectDependencyDagValidation,
    detectUncommittedFixCheck,
    detectVerificationOwnerAssigned,
    detectExternalInterfaceValidation,
  ];
  return checks
    .map((fn) => fn(ctx))
    .filter((check): check is SubmissionCheckResult => check !== null);
}
