import { describe, expect, it } from "vitest";
import { runSubmissionGate, submissionGateShouldBlock } from "../submission-engine.js";

describe("submission-engine", () => {
  it("blocks on mock placeholder patterns", () => {
    const checks = runSubmissionGate({
      files: [
        {
          filename: "src/handler.ts",
          patch: "@@\n+export function run() { // TODO(mock) return {}; }\n",
        },
      ],
    });
    expect(checks.some((c) => c.code === "mock_placeholder")).toBe(true);
    expect(submissionGateShouldBlock(checks)).toBe(true);
  });

  it("warns on stale naming terms when configured", () => {
    const checks = runSubmissionGate({
      files: [
        {
          filename: "README.md",
          patch: "@@\n+Uses DeployGuard for gating.\n",
        },
      ],
      komatikInstance: true,
    });
    const stale = checks.find((c) => c.code === "context_freshness");
    expect(stale?.severity).toBe("warn");
    expect(submissionGateShouldBlock(checks)).toBe(false);
  });

  it("blocks on destructive SQL", () => {
    const checks = runSubmissionGate({
      files: [
        {
          filename: "supabase/migrations/001.sql",
          patch: "@@\n+DROP TABLE users;\n",
        },
      ],
    });
    expect(checks.some((c) => c.code === "destructive_sql")).toBe(true);
  });

  it("blocks when added lines reference missing files", () => {
    const checks = runSubmissionGate({
      files: [
        {
          filename: "src/index.ts",
          patch: "@@\n+import { trust } from './trust.ts';\n",
        },
      ],
    });
    expect(checks.some((c) => c.code === "artifact_integrity")).toBe(true);
  });
});
