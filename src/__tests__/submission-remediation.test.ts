import { describe, it, expect } from "vitest";
import { deriveSubmissionFixes } from "../submission-remediation.js";

describe("deriveSubmissionFixes", () => {
  it("maps submission checks to remediation fix codes", () => {
    const fixes = deriveSubmissionFixes([
      {
        code: "artifact_integrity",
        severity: "blocking",
        title: "Phantom file",
        detail: "Missing from diff",
        files: ["src/missing.ts"],
        autofix_eligible: false,
      },
    ]);

    expect(fixes).toHaveLength(1);
    expect(fixes[0].code).toBe("submission.artifact_integrity");
    expect(fixes[0].severity).toBe("blocking");
    expect(fixes[0].files).toEqual(["src/missing.ts"]);
  });

  it("returns empty array when no checks provided", () => {
    expect(deriveSubmissionFixes(undefined)).toEqual([]);
    expect(deriveSubmissionFixes([])).toEqual([]);
  });
});
