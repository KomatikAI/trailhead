/**
 * ADR-011 §1 — the Release Brief: the structured statement a human reads at the
 * moment of a release decision, and its markdown renderer.
 *
 * This module is pure by design: no octokit, no GateEvaluation import, no
 * dependency on the input-relevance policy. The integrator maps whatever it has
 * onto `ReleaseBrief` and posts `renderReleaseBrief()`'s output.
 */

export type BriefVerdict = "allow" | "warn" | "block" | "cannot_evaluate";

export interface BriefFinding {
  id: string;
  title: string;
  evidence?: string;
  severity: "blocking" | "warn" | "advisory";
}

export interface BriefInput {
  checkName: string;
  /** ADR-009 status, carried as a string so this module stays policy-agnostic. */
  status: string;
  /** ADR-011 §2 disposition, likewise carried structurally. */
  disposition: string;
  reason?: string;
}

export interface BriefAction {
  kind: "fix" | "override" | "wait";
  detail: string;
  link?: string;
}

export interface BriefOverride {
  by: string;
  at: string;
  scope: string;
  rationale: string;
}

export interface ReleaseBrief {
  verdict: BriefVerdict;
  riskScore?: number;
  riskThreshold?: number;
  topMovers?: Array<{ factor: string; score: number }>;
  findings: BriefFinding[];
  inputs: BriefInput[];
  delta?: string;
  actions: BriefAction[];
  override?: BriefOverride | null;
  cannotEvaluateReason?: string;
}

/**
 * One side of the ADR-011 §1 `delta` comparison. Fields are optional because the
 * evaluation store may not return them (older rows, narrow selects, backends that
 * project a subset) — every absent field simply drops out of the sentence.
 */
export interface DeltaSnapshot {
  verdict?: string;
  riskScore?: number;
  findingIds?: string[];
}

function countDiff(
  previous: string[],
  current: string[],
): { resolved: number; added: number } {
  const before = new Set(previous);
  const after = new Set(current);
  let resolved = 0;
  for (const id of before) if (!after.has(id)) resolved += 1;
  let added = 0;
  for (const id of after) if (!before.has(id)) added += 1;
  return { resolved, added };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Render the one-line "vs previous" delta, e.g.
 * `vs previous: block -> allow, risk 90 -> 42, 3 findings resolved, 1 new`.
 *
 * Returns undefined when the two snapshots share no comparable field — a missing
 * or unreachable previous evaluation must omit the delta, never error (ADR-011 §1).
 */
export function formatEvaluationDelta(
  previous: DeltaSnapshot,
  current: DeltaSnapshot,
): string | undefined {
  const parts: string[] = [];
  let comparable = false;

  if (previous.verdict !== undefined && current.verdict !== undefined) {
    comparable = true;
    if (previous.verdict !== current.verdict) {
      parts.push(`${previous.verdict} -> ${current.verdict}`);
    }
  }

  if (previous.riskScore !== undefined && current.riskScore !== undefined) {
    comparable = true;
    if (previous.riskScore !== current.riskScore) {
      parts.push(`risk ${previous.riskScore} -> ${current.riskScore}`);
    }
  }

  if (previous.findingIds !== undefined && current.findingIds !== undefined) {
    comparable = true;
    const { resolved, added } = countDiff(previous.findingIds, current.findingIds);
    if (resolved > 0) parts.push(`${plural(resolved, "finding")} resolved`);
    if (added > 0) parts.push(`${added} new`);
  }

  if (!comparable) return undefined;
  return `vs previous: ${parts.length > 0 ? parts.join(", ") : "no change"}`;
}

const DEFAULT_MAX_CHARS = 60000;
const EVIDENCE_CAP_CHARS = 300;
const EMPTY_CELL = "—";

function escapePipes(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/** Table cells must be single-line and must not break the column structure. */
function cell(value: string): string {
  const flattened = value.replace(/\r?\n/g, " ").trim();
  if (flattened.length === 0) return EMPTY_CELL;
  return escapePipes(flattened);
}

function verdictLabel(verdict: BriefVerdict): string {
  return verdict.replace(/_/g, " ").toUpperCase();
}

function verdictLine(brief: ReleaseBrief): string {
  const segments: string[] = [];

  if (brief.riskScore !== undefined) {
    segments.push(
      brief.riskThreshold !== undefined
        ? `risk ${brief.riskScore} (threshold ${brief.riskThreshold})`
        : `risk ${brief.riskScore}`,
    );
  } else if (brief.riskThreshold !== undefined) {
    segments.push(`threshold ${brief.riskThreshold}`);
  }

  if (brief.topMovers && brief.topMovers.length > 0) {
    const movers = brief.topMovers
      .map((mover) => `${mover.factor} ${mover.score}`)
      .join(", ");
    segments.push(`top movers: ${movers}`);
  }

  const badge = `**${verdictLabel(brief.verdict)}**`;
  return segments.length > 0 ? `${badge} — ${segments.join(" · ")}` : badge;
}

function capEvidence(evidence: string, cap: number | undefined): string {
  if (cap === undefined || evidence.length <= cap) return evidence;
  // Ellipsis included, so the capped evidence is exactly `cap` characters.
  return `${evidence.slice(0, cap - 1)}…`;
}

function findingLines(
  finding: BriefFinding,
  index: number,
  evidenceCap: number | undefined,
): string[] {
  const lines = [
    `${index + 1}. **${escapePipes(finding.title)}** \`${finding.id}\` _(${finding.severity})_`,
  ];
  const evidence = finding.evidence?.trim();
  if (evidence) {
    for (const line of capEvidence(evidence, evidenceCap).split(/\r?\n/)) {
      lines.push(`   > ${escapePipes(line)}`);
    }
  }
  return lines;
}

function buildBrief(
  brief: ReleaseBrief,
  keepFindings: number,
  evidenceCap: number | undefined,
  storedEvaluationUrl: string | undefined,
): string {
  const lines: string[] = ["## Release Brief", "", verdictLine(brief), ""];

  // ADR-011 §1: "silence is a bug" — a cannot-evaluate brief must say why, up top.
  if (brief.verdict === "cannot_evaluate" || brief.cannotEvaluateReason) {
    const reason = brief.cannotEvaluateReason?.trim();
    lines.push(
      `> ⚠️ **Cannot evaluate:** ${reason && reason.length > 0 ? reason : "no reason recorded"}`,
      "",
    );
  }

  lines.push("### Findings", "");
  if (brief.findings.length === 0) {
    lines.push("No findings.", "");
  } else {
    // ADR-011 §1: findings are enumerated, never counted.
    const shown = brief.findings.slice(0, Math.max(0, keepFindings));
    shown.forEach((finding, index) => {
      lines.push(...findingLines(finding, index, evidenceCap));
    });
    const hidden = brief.findings.length - shown.length;
    if (hidden > 0) {
      const target = storedEvaluationUrl
        ? `[stored evaluation](${storedEvaluationUrl})`
        : "stored evaluation";
      lines.push(`_…${hidden} more findings not shown inline — see the ${target}_`);
    }
    lines.push("");
  }

  lines.push("### Inputs", "");
  if (brief.inputs.length === 0) {
    lines.push("No inputs evaluated.", "");
  } else {
    lines.push(
      `| Check | Status | Disposition | Reason |`,
      `|-------|--------|-------------|--------|`,
    );
    for (const input of brief.inputs) {
      lines.push(
        `| ${cell(input.checkName)} | ${cell(input.status)} | ${cell(input.disposition)} | ${cell(input.reason ?? "")} |`,
      );
    }
    lines.push("");
  }

  const delta = brief.delta?.trim();
  if (delta) {
    lines.push(`**Delta:** ${delta}`, "");
  }

  lines.push("### Actions", "");
  if (brief.actions.length === 0) {
    lines.push("No actions.", "");
  } else {
    for (const action of brief.actions) {
      const link = action.link ? ` ([link](${action.link}))` : "";
      lines.push(`- **${action.kind}:** ${action.detail}${link}`);
    }
    lines.push("");
  }

  if (brief.override) {
    const owner = brief.override.by.replace(/^@+/, "");
    lines.push(
      "### Override",
      "",
      `> Overridden by @${owner} at ${brief.override.at}, scope ${brief.override.scope} — ${brief.override.rationale}`,
      "",
    );
  }

  return lines.join("\n").trimEnd();
}

/**
 * Render a Release Brief as markdown suitable for a PR comment section.
 *
 * Truncation order (ADR-011 §1): drop findings from the end first (always
 * keeping at least one plus a pointer to the stored evaluation), then cap
 * evidence, and only then hard-clip. The result never exceeds `maxChars`.
 */
export function renderReleaseBrief(
  brief: ReleaseBrief,
  opts?: { maxChars?: number; storedEvaluationUrl?: string },
): string {
  const requested = opts?.maxChars ?? DEFAULT_MAX_CHARS;
  const maxChars = Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_MAX_CHARS;
  if (maxChars <= 0) return "";
  const storedEvaluationUrl = opts?.storedEvaluationUrl;

  const total = brief.findings.length;
  let rendered = buildBrief(brief, total, undefined, storedEvaluationUrl);
  if (rendered.length <= maxChars) return rendered;

  for (let keep = total - 1; keep >= 1; keep--) {
    rendered = buildBrief(brief, keep, undefined, storedEvaluationUrl);
    if (rendered.length <= maxChars) return rendered;
  }

  const minKeep = total > 0 ? 1 : 0;
  rendered = buildBrief(brief, minKeep, EVIDENCE_CAP_CHARS, storedEvaluationUrl);
  if (rendered.length <= maxChars) return rendered;

  // Last resort: the length contract outranks markdown well-formedness.
  return rendered.slice(0, maxChars);
}
