import { describe, expect, it } from "vitest";
import { runSubmissionGate } from "../submission-engine.js";

describe("submission-engine B1 checks", () => {
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

  it("blocks on missing RLS for new table", () => {
    const checks = runSubmissionGate({
      files: [
        {
          filename: "supabase/migrations/001.sql",
          patch: "@@\n+CREATE TABLE public.widgets (id uuid primary key);\n",
        },
      ],
    });
    expect(checks.some((c) => c.code === "rls_new_tables")).toBe(true);
  });

  it("blocks on syntax errors in JSON when full content is provided", () => {
    const checks = runSubmissionGate({
      files: [
        {
          filename: "config.json",
          content: "{ broken json",
        },
      ],
    });
    expect(checks.some((c) => c.code === "syntax_validity")).toBe(true);
  });

  it("blocks on API route without auth", () => {
    const checks = runSubmissionGate({
      files: [
        {
          filename: "app/api/users/route.ts",
          patch:
            "@@\n+export async function GET() { return Response.json({ ok: true }); }\n",
        },
      ],
    });
    expect(checks.some((c) => c.code === "auth_route_auth")).toBe(true);
  });

  it("blocks SOUL edits on Komatik instance", () => {
    const checks = runSubmissionGate({
      komatikInstance: true,
      files: [{ filename: "agents/frontend-dev/SOUL.md", patch: "@@\n+updated\n" }],
    });
    expect(checks.some((c) => c.code === "soul_integrity")).toBe(true);
  });
});
