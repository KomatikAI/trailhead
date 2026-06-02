import { describe, expect, it, vi } from "vitest";
import {
  resolveCrossRepoTargets,
  runCrossRepoOpener,
  type CrossRepoOpenerClient,
} from "../cross-repo-opener.js";
import type { ContractRefFinding } from "../submission-checks/contract-integrity.js";

// A satellite catalog that consumes an API no repo in the index publishes.
const CONSUMER_CATALOG = `
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: sundog
spec:
  type: service
  owner: komatik
  consumesApis:
    - komatik-v3-prebuild
`;

function b64(s: string) {
  return {
    data: { content: Buffer.from(s, "utf8").toString("base64"), encoding: "base64" },
  };
}

function finding(over: Partial<ContractRefFinding>): ContractRefFinding {
  return {
    file: "catalog-info.yaml",
    field: "consumesApis",
    ref: over.name ?? "x",
    name: "x",
    kind: "contract",
    ...over,
  };
}

describe("resolveCrossRepoTargets", () => {
  it("groups contract refs by owning repo, dedupes, ignores local/owned kinds", () => {
    const findings = [
      finding({ name: "komatik-v3-prebuild" }),
      finding({ name: "komatik-v3-prebuild", file: "other/catalog-info.yaml" }), // dup
      finding({ name: "identity" }),
      finding({ name: "foo", kind: "local", field: "system" }),
      finding({ name: "bar", kind: "owned", field: "providesApis" }),
    ];
    const { targets, unresolved } = resolveCrossRepoTargets(
      findings,
      {
        "komatik-v3-prebuild": "KomatikAI/komatik",
        identity: "KomatikAI/komatik",
      },
      ["KomatikAI"],
    );
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ owner: "KomatikAI", repo: "komatik" });
    expect(targets[0].entities).toEqual(["identity", "komatik-v3-prebuild"]);
    // local/owned never enter targets OR unresolved (not cross-repo)
    expect(unresolved).toHaveLength(0);
  });

  it("records unmapped, malformed, and allowlist-excluded refs as unresolved", () => {
    const { targets, unresolved } = resolveCrossRepoTargets(
      [
        finding({ name: "unmapped-api" }),
        finding({ name: "bad", field: "dependsOn" }),
        finding({ name: "external-api" }),
      ],
      { bad: "no-slash", "external-api": "SomeoneElse/thing" },
      ["KomatikAI"],
    );
    expect(targets).toHaveLength(0);
    expect(unresolved.map((u) => u.name).sort()).toEqual([
      "bad",
      "external-api",
      "unmapped-api",
    ]);
    expect(unresolved.find((u) => u.name === "external-api")?.reason).toContain(
      "allowlist",
    );
    expect(unresolved.find((u) => u.name === "bad")?.reason).toContain("Malformed");
  });
});

const baseRun = {
  gatedOwner: "KomatikAI",
  gatedRepo: "sundog",
  headBranch: "feat/consume",
  catalogPaths: ["catalog-info.yaml"],
  evaluationId: "eval-xr",
  apiOwners: { "komatik-v3-prebuild": "KomatikAI/komatik" },
  prContext: { number: 42, url: "https://github.com/KomatikAI/sundog/pull/42" },
};

function mockClient(opts?: {
  openPrs?: Array<{ number: number; html_url?: string; head?: { ref?: string } }>;
}) {
  const created = new Set<string>();
  const calls = {
    createRef: vi.fn(),
    createCommit: vi.fn(),
    pullsCreate: vi.fn(),
  };
  const client = {
    rest: {
      repos: {
        get: vi.fn(async () => ({ data: { default_branch: "main" } })),
        getContent: vi.fn(async (p: { repo: string }) => {
          if (p.repo === "sundog") return b64(CONSUMER_CATALOG);
          throw new Error("404 — owning repo has no catalog yet");
        }),
      },
      git: {
        getRef: vi.fn(async (p: { ref: string }) => {
          if (p.ref === "heads/main") return { data: { object: { sha: "main-sha" } } };
          if (created.has(p.ref)) return { data: { object: { sha: "branch-sha" } } };
          throw new Error("404 no ref");
        }),
        createRef: vi.fn(async (p: { ref: string }) => {
          created.add(p.ref.replace(/^refs\//, ""));
          calls.createRef(p.ref);
          return {};
        }),
        getCommit: vi.fn(async () => ({ data: { tree: { sha: "base-tree" } } })),
        createBlob: vi.fn(async () => ({ data: { sha: "blob-sha" } })),
        createTree: vi.fn(async () => ({ data: { sha: "tree-sha" } })),
        createCommit: vi.fn(async () => {
          calls.createCommit();
          return { data: { sha: "commit-sha" } };
        }),
        updateRef: vi.fn(async () => ({})),
      },
      pulls: {
        list: vi.fn(async () => ({ data: opts?.openPrs ?? [] })),
        create: vi.fn(async () => {
          calls.pullsCreate();
          return {
            data: {
              number: 99,
              html_url: "https://github.com/KomatikAI/komatik/pull/99",
            },
          };
        }),
      },
    },
  };
  return { client: client as unknown as CrossRepoOpenerClient, calls };
}

describe("runCrossRepoOpener", () => {
  it("opens a declaration PR in the owning repo when enabled", async () => {
    const { client, calls } = mockClient();
    const res = await runCrossRepoOpener({ ...baseRun, client, enabled: true });
    expect(res.enabled).toBe(true);
    expect(res.outcomes).toHaveLength(1);
    const o = res.outcomes[0];
    expect(o).toMatchObject({
      owner: "KomatikAI",
      repo: "komatik",
      entities: ["komatik-v3-prebuild"],
      status: "opened",
      prNumber: 99,
    });
    expect(calls.createRef).toHaveBeenCalledTimes(1);
    expect(calls.createCommit).toHaveBeenCalledTimes(1);
    expect(calls.pullsCreate).toHaveBeenCalledTimes(1);
  });

  it("dry-runs by default (enabled omitted): plans, opens nothing", async () => {
    const { client, calls } = mockClient();
    const res = await runCrossRepoOpener({ ...baseRun, client });
    expect(res.enabled).toBe(false);
    expect(res.outcomes[0].status).toBe("dry-run");
    expect(calls.createRef).not.toHaveBeenCalled();
    expect(calls.pullsCreate).not.toHaveBeenCalled();
  });

  it("dedupes: skips when an open declaration PR already exists", async () => {
    const { client, calls } = mockClient({
      openPrs: [{ number: 7, html_url: "x", head: { ref: "whatever" } }],
    });
    const res = await runCrossRepoOpener({ ...baseRun, client, enabled: true });
    expect(res.outcomes[0]).toMatchObject({ status: "exists", prNumber: 7 });
    expect(calls.createRef).not.toHaveBeenCalled();
    expect(calls.pullsCreate).not.toHaveBeenCalled();
  });

  it("skips entirely when no api_owners are configured", async () => {
    const { client } = mockClient();
    const res = await runCrossRepoOpener({
      ...baseRun,
      client,
      apiOwners: {},
      enabled: true,
    });
    expect(res.outcomes).toHaveLength(0);
    expect(res.skippedReason).toContain("No api_owners");
  });

  it("skips when there is no PR head branch", async () => {
    const { client } = mockClient();
    const res = await runCrossRepoOpener({
      ...baseRun,
      client,
      headBranch: undefined,
      enabled: true,
    });
    expect(res.skippedReason).toContain("head branch");
  });

  it("surfaces unresolved refs when the consumed API has no owner mapping", async () => {
    const { client, calls } = mockClient();
    const res = await runCrossRepoOpener({
      ...baseRun,
      client,
      apiOwners: { "some-other-api": "KomatikAI/komatik" },
      enabled: true,
    });
    expect(res.outcomes).toHaveLength(0);
    expect(res.unresolved.map((u) => u.name)).toContain("komatik-v3-prebuild");
    expect(calls.pullsCreate).not.toHaveBeenCalled();
  });
});
