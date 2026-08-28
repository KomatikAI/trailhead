import { describe, it, expect } from "vitest";
import {
  resolveDisposition,
  resolveDispositions,
  dispositionCountsTowardBlocking,
  DEFAULT_ADVISORY_REASON,
  DEFAULT_BLOCKING_REASON,
  DEFAULT_SKIPPED_UPSTREAM_REASON,
  MISSING_IRRELEVANT_REASON,
} from "../input-relevance.js";
import type {
  DispositionCheckInput,
  InputRelevanceEntry,
  ResolvedDisposition,
} from "../input-relevance.js";

const ALL_STATUSES: DispositionCheckInput["status"][] = [
  "pass",
  "fail",
  "skip",
  "pending",
  "stale",
  "missing",
];

function check(
  name: string,
  status: DispositionCheckInput["status"],
  required = true,
): DispositionCheckInput {
  return { name, status, required };
}

describe("resolveDisposition — defaults (no entry matches)", () => {
  it("required check with empty policy defaults to blocking, and says why", () => {
    expect(resolveDisposition(check("CI Gate", "fail"), [])).toEqual({
      kind: "blocking",
      reason: DEFAULT_BLOCKING_REASON,
      source: "default",
    });
  });

  it("optional check with empty policy defaults to advisory, and says why", () => {
    expect(resolveDisposition(check("Lint", "fail", false), [])).toEqual({
      kind: "advisory",
      reason: DEFAULT_ADVISORY_REASON,
      source: "default",
    });
  });

  it("falls back to default when entries exist but none match", () => {
    const entries: InputRelevanceEntry[] = [
      {
        pattern: "Deploy *",
        disposition: "irrelevant",
        reason: "unconfigured by design",
      },
    ];
    expect(resolveDisposition(check("type-check", "fail"), entries)).toEqual({
      kind: "blocking",
      reason: DEFAULT_BLOCKING_REASON,
      source: "default",
    });
  });

  it("never leaves a default disposition without a reason (no bare `advisory / —`)", () => {
    for (const status of ALL_STATUSES) {
      for (const required of [true, false]) {
        const resolved = resolveDisposition(check("CI Gate", status, required), []);
        expect(resolved.source).toBe("default");
        expect(resolved.reason?.trim()).toBeTruthy();
      }
    }
  });

  it("defaults hold across every ADR-009 status except skip", () => {
    for (const status of ALL_STATUSES) {
      if (status === "skip") continue;
      const required = resolveDisposition(check("CI Gate", status), []);
      const optional = resolveDisposition(check("CI Gate", status, false), []);
      expect(required.source).toBe("default");
      expect(optional.source).toBe("default");
      expect(required.kind).toBe(status === "missing" ? "missing_blocking" : "blocking");
      expect(optional.kind).toBe("advisory");
    }
  });
});

// ADR-011 §2 — a path-filtered check has already been classified out by the
// workflow itself; the brief says so instead of listing it as a silent input.
describe("resolveDisposition — skip status is irrelevant, any source", () => {
  it("resolves a skipped required check to irrelevant with a self-describing reason", () => {
    expect(resolveDisposition(check("web e2e", "skip"), [])).toEqual({
      kind: "irrelevant",
      reason: DEFAULT_SKIPPED_UPSTREAM_REASON,
      source: "default",
    });
  });

  it("resolves a skipped optional check the same way", () => {
    expect(resolveDisposition(check("web e2e", "skip", false), [])).toEqual({
      kind: "irrelevant",
      reason: DEFAULT_SKIPPED_UPSTREAM_REASON,
      source: "default",
    });
  });

  // Promotion-zero correction (trailhead#350): komatik#4043 rendered
  // "skip | blocking | —" for path-filtered checks the seed table marks blocking.
  // A skip resolves to irrelevant whatever the source; only a policy entry that
  // already classified the check out keeps its own reason.
  it("rewrites a policy-sourced blocking/advisory skip to irrelevant(skipped upstream)", () => {
    const entries: InputRelevanceEntry[] = [
      { pattern: "web e2e", disposition: "blocking", reason: "required on this pair" },
      { pattern: "Lint", disposition: "advisory", reason: "style only" },
    ];
    expect(resolveDisposition(check("web e2e", "skip"), entries)).toEqual({
      kind: "irrelevant",
      reason: DEFAULT_SKIPPED_UPSTREAM_REASON,
      source: "policy",
    });
    expect(resolveDisposition(check("Lint", "skip", false), entries)).toEqual({
      kind: "irrelevant",
      reason: DEFAULT_SKIPPED_UPSTREAM_REASON,
      source: "policy",
    });
  });

  it("keeps a policy irrelevant entry's own reason on a skip", () => {
    const entries: InputRelevanceEntry[] = [
      { pattern: "Deploy *", disposition: "irrelevant", reason: "staging unconfigured" },
    ];
    expect(resolveDisposition(check("Deploy Edge Functions", "skip"), entries)).toEqual({
      kind: "irrelevant",
      reason: "staging unconfigured",
      source: "policy",
    });
  });

  it("never rewrites a policy-sourced disposition for any non-skip status", () => {
    const entries: InputRelevanceEntry[] = [
      { pattern: "web e2e", disposition: "blocking", reason: "required on this pair" },
    ];
    for (const status of ["pass", "fail", "pending", "stale"] as const) {
      expect(resolveDisposition(check("web e2e", status), entries)).toEqual({
        kind: "blocking",
        reason: "required on this pair",
        source: "policy",
      });
    }
  });

  it("policy-sourced skip leaves the blocking set (outcome-neutral)", () => {
    const entries: InputRelevanceEntry[] = [
      { pattern: "web e2e", disposition: "blocking", reason: "required on this pair" },
    ];
    expect(
      dispositionCountsTowardBlocking(
        resolveDisposition(check("web e2e", "skip"), entries),
      ),
    ).toBe(false);
  });

  // Leaving the blocking set is outcome-neutral because every rollup already
  // treated `skip` as passing; adr011-wiring.test.ts proves that end to end.
  it("leaves the blocking set", () => {
    expect(
      dispositionCountsTowardBlocking(resolveDisposition(check("web e2e", "skip"), [])),
    ).toBe(false);
  });
});

describe("resolveDisposition — entry ordering", () => {
  const entries: InputRelevanceEntry[] = [
    {
      pattern: "Deploy Edge Functions",
      disposition: "irrelevant",
      reason: "staging unconfigured",
    },
    { pattern: "Deploy *", disposition: "advisory", reason: "deploys never block" },
    { pattern: "*", disposition: "blocking", reason: "catch-all" },
  ];

  it("first matching entry wins even when later entries also match", () => {
    expect(resolveDisposition(check("Deploy Edge Functions", "fail"), entries)).toEqual({
      kind: "irrelevant",
      reason: "staging unconfigured",
      source: "policy",
    });
  });

  it("falls through to the second entry when the first does not match", () => {
    expect(resolveDisposition(check("Deploy Docs", "fail"), entries)).toEqual({
      kind: "advisory",
      reason: "deploys never block",
      source: "policy",
    });
  });

  it("a catch-all glob matches anything not claimed earlier", () => {
    expect(resolveDisposition(check("type-check", "fail", false), entries)).toEqual({
      kind: "blocking",
      reason: "catch-all",
      source: "policy",
    });
  });

  it("reversing declaration order reverses the winner", () => {
    const reversed = [...entries].reverse();
    expect(
      resolveDisposition(check("Deploy Edge Functions", "fail"), reversed).kind,
    ).toBe("blocking");
  });
});

describe("resolveDisposition — pattern matching semantics", () => {
  function kindFor(pattern: string, name: string): string {
    const entries: InputRelevanceEntry[] = [{ pattern, disposition: "advisory" }];
    // required=true so a non-match is visibly "blocking"
    return resolveDisposition(check(name, "fail"), entries).kind;
  }

  it("matches exactly", () => {
    expect(kindFor("CI Gate", "CI Gate")).toBe("advisory");
  });

  it("matches case-insensitively", () => {
    expect(kindFor("ci gate", "CI Gate")).toBe("advisory");
    expect(kindFor("CI GATE", "CI Gate")).toBe("advisory");
  });

  it("matches a configured prefix (checkNameMatches semantics)", () => {
    expect(kindFor("Deploy", "Deploy Edge Functions")).toBe("advisory");
    expect(kindFor("deploy", "Deploy Edge Functions")).toBe("advisory");
  });

  it("does not match a suffix", () => {
    expect(kindFor("Edge Functions", "Deploy Edge Functions")).toBe("blocking");
  });

  it("matches a trailing glob", () => {
    expect(kindFor("Deploy *", "Deploy Edge Functions")).toBe("advisory");
  });

  it("matches a leading glob (glob-only — prefix matching cannot)", () => {
    expect(kindFor("* Functions", "Deploy Edge Functions")).toBe("advisory");
  });

  it("matches a single-character glob", () => {
    expect(kindFor("test-?", "test-1")).toBe("advisory");
    expect(kindFor("test-?", "test-12")).toBe("blocking");
  });

  it("matches a globstar across slashes", () => {
    expect(kindFor("CI Gate / **", "CI Gate / type-check")).toBe("advisory");
  });

  it("treats regex metacharacters in the pattern as literals", () => {
    expect(kindFor("build(prod)", "build(prod)")).toBe("advisory");
    expect(kindFor("build(prod)", "buildXprodY")).toBe("blocking");
  });

  it("does not match unrelated names", () => {
    expect(kindFor("Deploy *", "type-check")).toBe("blocking");
  });

  it("ignores blank patterns instead of prefix-matching everything", () => {
    expect(kindFor("", "anything at all")).toBe("blocking");
    expect(kindFor("   ", "anything at all")).toBe("blocking");
  });
});

describe("resolveDisposition — irrelevant reason handling", () => {
  it("keeps a configured reason", () => {
    const entries: InputRelevanceEntry[] = [
      {
        pattern: "Deploy *",
        disposition: "irrelevant",
        reason: "staging target unconfigured",
      },
    ];
    expect(
      resolveDisposition(check("Deploy Edge Functions", "fail"), entries).reason,
    ).toBe("staging target unconfigured");
  });

  it("substitutes the placeholder when reason is absent", () => {
    const entries: InputRelevanceEntry[] = [
      { pattern: "Deploy *", disposition: "irrelevant" },
    ];
    expect(resolveDisposition(check("Deploy Edge Functions", "fail"), entries)).toEqual({
      kind: "irrelevant",
      reason: MISSING_IRRELEVANT_REASON,
      source: "policy",
    });
  });

  it("substitutes the placeholder for an empty or whitespace-only reason", () => {
    for (const reason of ["", "   "]) {
      const entries: InputRelevanceEntry[] = [
        { pattern: "Deploy *", disposition: "irrelevant", reason },
      ];
      expect(
        resolveDisposition(check("Deploy Edge Functions", "fail"), entries).reason,
      ).toBe(MISSING_IRRELEVANT_REASON);
    }
  });

  it("does not invent a reason for blocking or advisory entries", () => {
    const entries: InputRelevanceEntry[] = [
      { pattern: "Deploy *", disposition: "advisory" },
      { pattern: "CI *", disposition: "blocking", reason: "   " },
    ];
    expect(resolveDisposition(check("Deploy Docs", "fail"), entries)).toEqual({
      kind: "advisory",
      source: "policy",
    });
    expect(resolveDisposition(check("CI Gate", "fail"), entries)).toEqual({
      kind: "blocking",
      source: "policy",
    });
  });
});

describe("resolveDisposition — missing_blocking derivation", () => {
  it("derives missing_blocking from a policy blocking entry", () => {
    const entries: InputRelevanceEntry[] = [
      { pattern: "CI Gate", disposition: "blocking", reason: "core gate" },
    ];
    expect(resolveDisposition(check("CI Gate", "missing"), entries)).toEqual({
      kind: "missing_blocking",
      reason: "core gate",
      source: "policy",
    });
  });

  it("derives missing_blocking from the required default, keeping its reason", () => {
    expect(resolveDisposition(check("CI Gate", "missing"), [])).toEqual({
      kind: "missing_blocking",
      reason: DEFAULT_BLOCKING_REASON,
      source: "default",
    });
  });

  it("does not derive missing_blocking for advisory or irrelevant inputs", () => {
    const entries: InputRelevanceEntry[] = [
      { pattern: "Deploy *", disposition: "irrelevant", reason: "by design" },
      { pattern: "Lint", disposition: "advisory" },
    ];
    expect(
      resolveDisposition(check("Deploy Edge Functions", "missing"), entries).kind,
    ).toBe("irrelevant");
    expect(resolveDisposition(check("Lint", "missing"), entries).kind).toBe("advisory");
    expect(resolveDisposition(check("Lint", "missing", false), []).kind).toBe("advisory");
  });

  it("only status=missing derives it — no other status does", () => {
    for (const status of ALL_STATUSES) {
      const kind = resolveDisposition(check("CI Gate", status), []).kind;
      if (status === "missing") expect(kind).toBe("missing_blocking");
      else if (status === "skip") expect(kind).toBe("irrelevant");
      else expect(kind).toBe("blocking");
    }
  });

  it("cannot be configured directly — configured blocking + non-missing stays blocking", () => {
    const entries: InputRelevanceEntry[] = [
      { pattern: "CI Gate", disposition: "blocking" },
    ];
    expect(resolveDisposition(check("CI Gate", "fail"), entries).kind).toBe("blocking");
  });
});

describe("resolveDisposition — full status x disposition matrix", () => {
  const dispositions: InputRelevanceEntry["disposition"][] = [
    "blocking",
    "advisory",
    "irrelevant",
  ];

  it("resolves every combination as specified", () => {
    for (const disposition of dispositions) {
      for (const status of ALL_STATUSES) {
        for (const required of [true, false]) {
          const entries: InputRelevanceEntry[] = [
            { pattern: "Any Check", disposition, reason: "because" },
          ];
          const result = resolveDisposition(
            check("Any Check", status, required),
            entries,
          );
          const expectedKind =
            status === "skip"
              ? "irrelevant"
              : disposition === "blocking" && status === "missing"
                ? "missing_blocking"
                : disposition;
          const expectedReason =
            status === "skip" && disposition !== "irrelevant"
              ? DEFAULT_SKIPPED_UPSTREAM_REASON
              : "because";
          expect(result).toEqual({
            kind: expectedKind,
            reason: expectedReason,
            source: "policy",
          });
        }
      }
    }
  });
});

describe("resolveDispositions", () => {
  const entries: InputRelevanceEntry[] = [
    {
      pattern: "Deploy *",
      disposition: "irrelevant",
      reason: "staging unconfigured by design",
    },
    { pattern: "Lint", disposition: "advisory" },
  ];

  it("resolves each check, keyed by name", () => {
    const map = resolveDispositions(
      [
        check("CI Gate", "pass"),
        check("Deploy Edge Functions", "fail"),
        check("Lint", "fail", false),
        check("migration lint", "missing"),
      ],
      entries,
    );
    expect(map.size).toBe(4);
    expect(map.get("CI Gate")).toEqual({
      kind: "blocking",
      reason: DEFAULT_BLOCKING_REASON,
      source: "default",
    });
    expect(map.get("Deploy Edge Functions")).toEqual({
      kind: "irrelevant",
      reason: "staging unconfigured by design",
      source: "policy",
    });
    expect(map.get("Lint")).toEqual({ kind: "advisory", source: "policy" });
    expect(map.get("migration lint")).toEqual({
      kind: "missing_blocking",
      reason: DEFAULT_BLOCKING_REASON,
      source: "default",
    });
  });

  it("returns an empty map for no checks", () => {
    expect(resolveDispositions([], entries).size).toBe(0);
  });

  it("works with an empty policy table", () => {
    const map = resolveDispositions([check("CI Gate", "fail")], []);
    expect(map.get("CI Gate")).toEqual({
      kind: "blocking",
      reason: DEFAULT_BLOCKING_REASON,
      source: "default",
    });
  });

  it("keeps the first occurrence on duplicate check names", () => {
    const map = resolveDispositions(
      [check("CI Gate", "fail", true), check("CI Gate", "pass", false)],
      [],
    );
    expect(map.size).toBe(1);
    expect(map.get("CI Gate")).toEqual({
      kind: "blocking",
      reason: DEFAULT_BLOCKING_REASON,
      source: "default",
    });
  });

  it("returns undefined for an unknown check name", () => {
    expect(
      resolveDispositions([check("CI Gate", "pass")], entries).get("nope"),
    ).toBeUndefined();
  });
});

describe("dispositionCountsTowardBlocking", () => {
  const cases: Array<[ResolvedDisposition, boolean]> = [
    [{ kind: "blocking", source: "default" }, true],
    [{ kind: "missing_blocking", source: "default" }, true],
    [{ kind: "advisory", source: "default" }, false],
    [{ kind: "irrelevant", reason: "by design", source: "policy" }, false],
  ];

  it.each(cases)("%o -> %s", (resolved, expected) => {
    expect(dispositionCountsTowardBlocking(resolved)).toBe(expected);
  });

  it("Case B: a red but irrelevant deploy check does not block", () => {
    const entries: InputRelevanceEntry[] = [
      {
        pattern: "Deploy Edge Functions",
        disposition: "irrelevant",
        reason:
          "staging target unconfigured by design; see supabase-migrations.yml guard",
      },
    ];
    const resolved = resolveDisposition(check("Deploy Edge Functions", "fail"), entries);
    expect(dispositionCountsTowardBlocking(resolved)).toBe(false);
    expect(resolved.reason).toContain("unconfigured by design");
  });
});
