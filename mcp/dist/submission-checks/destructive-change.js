// Destructive Change detector (ADR-010) — evidence-gated destructive migrations.
//
// `destructive_sql` already BLOCKS the always-bad shapes (DROP TABLE / TRUNCATE /
// DELETE without WHERE). But it deliberately lets through *targeted* destructive
// ops that are legitimate WITH due diligence: a `DELETE ... WHERE`, an
// `ALTER ... DROP COLUMN`, a `DROP VIEW/TYPE/INDEX/...`, or a wide `UPDATE` with
// no WHERE. Those are exactly the changes that should ship only with recorded
// evidence — the FK / row-count / reversibility check a human does by hand today.
//
// This detector requires that evidence, inline in the migration, as a block:
//
//   -- @destructive-change
//   -- fk-refs: 0            (or: names of referencing tables + how handled)
//   -- affected-rows: 1      (or an estimate)
//   -- reversible: re-seed; row carries no referenced data   (or: no — <why ok>)
//   -- ack: dschirmer 2026-06-01
//
// Found a targeted destructive op but no complete evidence block → finding.
// Ships `warn` (phase-0, per ADR-008); target state is `blocking` w/o evidence.
// Self-heal follow-up: auto-run the FK/row probes and attach the evidence.
import { fileContent, normalizePath } from "./helpers.js";
const SQL_FILE = /\.sql$/i;
/** Targeted destructive ops that `destructive_sql` allows but that warrant evidence. */
const DESTRUCTIVE_OPS = [
    // DELETE with a WHERE (destructive_sql only blocks DELETE *without* WHERE).
    { label: "DELETE ... WHERE", pattern: /\bDELETE\s+FROM\s+[^\n;]*?\bWHERE\b/i },
    // ALTER TABLE ... DROP COLUMN (data loss; not a bare DROP TABLE).
    {
        label: "DROP COLUMN",
        pattern: /\bALTER\s+TABLE\b(?:(?!;)[\s\S])*?\bDROP\s+COLUMN\b/i,
    },
    // DROP of other objects (view/type/index/function/sequence/schema/mat-view).
    {
        label: "DROP <object>",
        pattern: /\bDROP\s+(?:MATERIALIZED\s+VIEW|VIEW|TYPE|INDEX|FUNCTION|SEQUENCE|SCHEMA)\b/i,
    },
    // Wide UPDATE — a SET with no WHERE before the statement terminator.
    {
        label: "UPDATE without WHERE",
        pattern: /\bUPDATE\s+[^\n;]+?\bSET\b(?:(?!\bWHERE\b)[^;])*;/i,
    },
];
const EVIDENCE_FIELDS = [
    { key: "fk-refs", pattern: /\bfk-refs\s*:/i },
    { key: "affected-rows", pattern: /\baffected-rows\s*:/i },
    { key: "reversible", pattern: /\breversible\s*:/i },
    { key: "ack", pattern: /\back\s*:/i },
];
function isSqlFile(file) {
    return SQL_FILE.test(normalizePath(file.filename));
}
export function detectDestructiveChange(ctx) {
    const sqlFiles = ctx.files.filter(isSqlFile);
    if (sqlFiles.length === 0)
        return null;
    const findings = [];
    for (const file of sqlFiles) {
        const content = fileContent(file);
        if (!content)
            continue;
        const ops = DESTRUCTIVE_OPS.filter((op) => op.pattern.test(content)).map((op) => op.label);
        if (ops.length === 0)
            continue;
        const missing = EVIDENCE_FIELDS.filter((f) => !f.pattern.test(content)).map((f) => f.key);
        if (missing.length === 0)
            continue; // op present, evidence complete → ok
        findings.push({ file: normalizePath(file.filename), ops, missing });
    }
    if (findings.length === 0)
        return null;
    const lines = findings.map((f) => `${f.file}: ${f.ops.join(", ")} — missing evidence: ${f.missing.join(", ")}`);
    return {
        code: "destructive_change",
        severity: "warn",
        title: "Destructive migration without an evidence bundle",
        detail: `Targeted destructive op(s) lack a complete evidence block: ${lines.join("; ")}.`,
        files: findings.map((f) => f.file),
        suggested_action: "Add an evidence block to the migration:\n" +
            "  -- @destructive-change\n" +
            "  -- fk-refs: <0 or referencing tables + how handled>\n" +
            "  -- affected-rows: <count or estimate>\n" +
            "  -- reversible: <how to undo, or 'no — <why acceptable>'>\n" +
            "  -- ack: <who/when>",
        autofix_eligible: false,
    };
}
