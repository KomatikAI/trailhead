import { describe, expect, it } from "vitest";
import { detectDestructiveChange } from "../submission-checks/destructive-change.js";
import type {
  SubmissionCheckContext,
  SubmissionFileInfo,
} from "../submission-checks/types.js";

function ctx(files: SubmissionFileInfo[]): SubmissionCheckContext {
  return {
    files,
    prPaths: new Set(files.map((f) => f.filename)),
    komatikInstance: false,
    staleTerms: [],
    namingAllowlist: {},
    authRouteAllowlist: [],
    maxFileLines: 1000,
    declaredPackages: new Set(),
    pathIgnorePatterns: [],
    renamePatterns: [],
    slugOnlyPatterns: [],
    detectorPolicy: {},
  };
}

const sql = (name: string, content: string): SubmissionFileInfo => ({
  filename: name,
  content,
  status: "added",
});

const EVIDENCE = `
-- @destructive-change
-- fk-refs: 0
-- affected-rows: 1
-- reversible: re-seed; the row carries no referenced data
-- ack: dschirmer 2026-06-01
`;

describe("destructive_change (ADR-010)", () => {
  it("flags a targeted DELETE ... WHERE with no evidence block", () => {
    const m = `DELETE FROM public.portfolio_projects WHERE slug = 'cognitive-debt';`;
    const res = detectDestructiveChange(ctx([sql("migrations/0001_retire.sql", m)]));
    expect(res).not.toBeNull();
    expect(res!.code).toBe("destructive_change");
    expect(res!.severity).toBe("warn");
    expect(res!.detail).toContain("DELETE ... WHERE");
    expect(res!.detail).toContain("fk-refs");
    expect(res!.detail).toContain("ack");
  });

  it("passes the same DELETE when a complete evidence block is present", () => {
    const m = `${EVIDENCE}\nDELETE FROM public.portfolio_projects WHERE slug = 'cognitive-debt';`;
    expect(
      detectDestructiveChange(ctx([sql("migrations/0001_retire.sql", m)])),
    ).toBeNull();
  });

  it("reports exactly which evidence fields are missing", () => {
    const m = `-- fk-refs: 0\n-- affected-rows: 1\nDELETE FROM t WHERE id = 1;`;
    const res = detectDestructiveChange(ctx([sql("m.sql", m)]));
    expect(res).not.toBeNull();
    expect(res!.detail).toContain("reversible");
    expect(res!.detail).toContain("ack");
    expect(res!.detail).not.toContain("missing evidence: fk-refs");
  });

  it("does NOT fire on DELETE without WHERE (that's destructive_sql's job)", () => {
    expect(detectDestructiveChange(ctx([sql("m.sql", "DELETE FROM t;")]))).toBeNull();
  });

  it("flags ALTER ... DROP COLUMN without evidence", () => {
    const m = `ALTER TABLE public.users DROP COLUMN legacy_field;`;
    const res = detectDestructiveChange(ctx([sql("m.sql", m)]));
    expect(res).not.toBeNull();
    expect(res!.detail).toContain("DROP COLUMN");
  });

  it("flags a wide UPDATE (no WHERE) without evidence", () => {
    const m = `UPDATE public.flags SET enabled = false;`;
    const res = detectDestructiveChange(ctx([sql("m.sql", m)]));
    expect(res).not.toBeNull();
    expect(res!.detail).toContain("UPDATE without WHERE");
  });

  it("does NOT fire on a scoped UPDATE with WHERE", () => {
    const m = `UPDATE public.flags SET enabled = false WHERE id = 3;`;
    expect(detectDestructiveChange(ctx([sql("m.sql", m)]))).toBeNull();
  });

  it("ignores additive migrations and non-SQL files", () => {
    expect(
      detectDestructiveChange(
        ctx([
          sql("m.sql", "CREATE TABLE t (id int);\nINSERT INTO t VALUES (1);"),
          { filename: "notes.md", content: "DELETE FROM t WHERE x=1", status: "added" },
        ]),
      ),
    ).toBeNull();
  });
});
