import { describe, expect, it } from "vitest";
import {
  detectContextFreshness,
  detectExternalPackageDeps,
  detectMockPlaceholder,
  detectSqlSyntaxBasic,
  detectSyntaxValidity,
} from "../submission-checks/detectors.js";
import type { SubmissionCheckContext } from "../submission-checks/types.js";
import { validateFileSyntax } from "../submission-checks/syntax-validity.js";

function ctx(partial: Partial<SubmissionCheckContext>): SubmissionCheckContext {
  return {
    files: [],
    prPaths: new Set(),
    komatikInstance: false,
    staleTerms: [],
    namingAllowlist: {},
    authRouteAllowlist: [],
    maxFileLines: 1000,
    declaredPackages: new Set(),
    pathIgnorePatterns: [],
    ...partial,
  };
}

describe("syntax_validity (@swc/core)", () => {
  it("catches real TypeScript syntax errors", () => {
    const err = validateFileSyntax(
      "flow-templates.ts",
      "export const x = { foo ident }\n",
    );
    expect(err).toBeTruthy();
  });

  it("accepts JSX with brackets inside strings", () => {
    const err = validateFileSyntax(
      "component.tsx",
      `export function C() { return <div title="[note]">{"(ok)"}</div>; }\n`,
    );
    expect(err).toBeNull();
  });

  it("catches unterminated strings", () => {
    const err = validateFileSyntax("payouts.ts", "const s = 'unterminated\n");
    expect(err).toBeTruthy();
  });

  it("flags invalid JSON via detectSyntaxValidity", () => {
    const checks = detectSyntaxValidity(
      ctx({
        files: [{ filename: "config.json", content: "{ broken" }],
      }),
    );
    expect(checks?.code).toBe("syntax_validity");
  });

  it("skips patch-only files (no full content)", () => {
    const checks = detectSyntaxValidity(
      ctx({
        files: [{ filename: "config.json", patch: "@@\n+{ broken\n" }],
      }),
    );
    expect(checks).toBeNull();
  });
});

describe("sql_syntax_basic", () => {
  it("does not flag valid PL/pgSQL with CASE/END IF/END LOOP", () => {
    const sql = `
CREATE OR REPLACE FUNCTION demo() RETURNS void AS $$
BEGIN
  CASE WHEN 1 = 1 THEN
    NULL;
  END CASE;
  IF true THEN
    NULL;
  END IF;
  LOOP
    EXIT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
`;
    const check = detectSqlSyntaxBasic(
      ctx({ files: [{ filename: "001-rls.sql", content: sql }] }),
    );
    expect(check).toBeNull();
  });

  it("warns on unclosed BEGIN block", () => {
    const sql = `
DO $$
BEGIN
  NULL;
`;
    const check = detectSqlSyntaxBasic(
      ctx({ files: [{ filename: "bad.sql", content: sql }] }),
    );
    expect(check?.code).toBe("sql_syntax_basic");
    expect(check?.severity).toBe("warn");
  });
});

describe("external_package_deps", () => {
  it("ignores http URL tokens like legacy gate", () => {
    const check = detectExternalPackageDeps(
      ctx({
        declaredPackages: new Set(["zod"]),
        files: [
          {
            filename: "src/handler.ts",
            content: `const url = "https://example.com";\n`,
          },
        ],
      }),
    );
    expect(check).toBeNull();
  });

  it("flags undeclared imports using project-scoped declared packages", () => {
    const check = detectExternalPackageDeps(
      ctx({
        declaredPackages: new Set(["zod"]),
        files: [
          {
            filename: "payments/pack/src/stripe/payouts.ts",
            content: `import Stripe from 'stripe';\n`,
          },
        ],
      }),
    );
    expect(check?.code).toBe("external_package_deps");
  });

  it("flags undeclared re-exports", () => {
    const check = detectExternalPackageDeps(
      ctx({
        declaredPackages: new Set(["zod"]),
        files: [
          {
            filename: "src/handler.ts",
            content: `export { foo } from 'stripe';\n`,
          },
        ],
      }),
    );
    expect(check?.code).toBe("external_package_deps");
  });
});

describe("context_freshness", () => {
  it("does not flag lowercase deployguard in quoted paths (legacy allowlist)", () => {
    const check = detectContextFreshness(
      ctx({
        komatikInstance: true,
        files: [
          {
            filename: "src/route.ts",
            content: `const repo = "komatik-agents/deployguard/workflow";\n`,
          },
        ],
      }),
    );
    expect(check).toBeNull();
  });

  it("flags branded DeployGuard outside allowlisted strings", () => {
    const check = detectContextFreshness(
      ctx({
        komatikInstance: true,
        files: [
          {
            filename: "src/route.ts",
            content: `// rename DeployGuard to Trailhead\n`,
          },
        ],
      }),
    );
    expect(check?.code).toBe("context_freshness");
  });
});

describe("context_freshness path ignore", () => {
  it("skips archived _stale paths", () => {
    const check = detectContextFreshness(
      ctx({
        komatikInstance: true,
        files: [
          {
            filename: "agents/foo/_stale/old/deployguard-notes.md",
            patch: "@@\n+still says DeployGuard here\n",
          },
        ],
      }),
    );
    expect(check).toBeNull();
  });
});

describe("mock_placeholder", () => {
  it('catches "In production, use" placeholder', () => {
    const check = detectMockPlaceholder(
      ctx({
        files: [
          {
            filename: "src/api.ts",
            patch: "@@\n+// In production, use real Stripe keys\n",
          },
        ],
      }),
    );
    expect(check?.code).toBe("mock_placeholder");
  });
});
