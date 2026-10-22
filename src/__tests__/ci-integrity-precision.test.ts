import { describe, expect, it } from "vitest";
import { detectCiIntegrity, OR_TRUE_SUPPRESSION_ALLOWLIST } from "../ci-integrity.js";

describe("CI integrity diff precision", () => {
  it("ignores unchanged and deleted bypass context", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: [
          "@@ -10,3 +10,4 @@",
          "  run: du -sh coverage || true",
          "- run: legacy-check || true",
          "+ run: npm test",
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
    expect(result.score).toBe(0);
  });

  it("still blocks a newly added bypass", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: "@@ -1,1 +1,2 @@\n+      run: npm test || true",
      },
    ]);

    expect(result.blockingPatterns).toHaveLength(1);
    expect(result.score).toBe(45);
  });

  it("exempts || true inside a trap cleanup handler (komatik#4864)", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/teams-worker.yml",
        patch: [
          "@@ -95,2 +95,3 @@",
          "       - name: Boot Teams image and prove exact release identity",
          "+          trap 'docker rm --force \"$container_id\" >/dev/null 2>&1 || true' EXIT",
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
    expect(result.score).toBe(0);
  });

  it("exempts the inline run: trap form", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: "@@ -1,1 +1,2 @@\n+        run: trap 'rm -rf \"$scratch\" || true' EXIT",
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
    expect(result.score).toBe(0);
  });

  it.each([
    'gh label create "$1" --color "$2" --description "$3" >/dev/null 2>&1 || true',
    "grep -c needle results.txt || true",
    "rg --count needle results.txt || true",
    "mkdir -p generated/report || true",
    "mkdir --parents generated/report || true",
    "install -d generated/report || true",
  ])("exempts the reviewed command shape: %s", (command) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: `@@ -1,1 +1,2 @@\n+        run: ${command}`,
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
    expect(result.score).toBe(0);
  });

  it.each([
    '        "run" : gh label create demo || true',
    "        'run'\t:\tgh label create demo || true",
    "        -   'run' : gh label create demo || true",
  ])("exempts a reviewed inline command behind a valid run key: %s", (line) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: `@@ -1,1 +1,2 @@\n+${line}`,
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
  });

  it("allows a reviewed suppression as the first command in a YAML block scalar", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch:
          '@@ -1,1 +1,3 @@\n+      run: |\n+        gh label create "$1" --color "$2" || true',
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
  });

  it("keeps independent commands in a literal YAML scalar independent", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch:
          '@@ -1,1 +1,4 @@\n+      run: |\n+        npm test\n+        gh label create "$1" || true',
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
  });

  it.each([
    "|",
    "|-",
    "|+",
    "|2",
    "|-2",
    "|+2",
    "|2-",
    "|2+",
    ">",
    ">-",
    ">+",
    ">2",
    ">-2",
    ">+2",
    ">2-",
    ">2+",
  ])("recognizes the valid YAML block header variant %s", (header) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: [
          "@@ -20,1 +20,3 @@",
          "       - name: Ensure labels",
          `+      run: ${header} # documentation may mention || true`,
          "+        gh label create demo || true",
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
  });

  it.each([
    "      run: >2-",
    "      run: >-2",
    "      run: >2+",
    "      run: >+2",
    "      run: >- # folded",
    "      run: > # folded",
    '      "run" : >2- # folded quoted key',
    "      'run' : >-2 # folded quoted key",
  ])("blocks an allowlisted line folded onto prior shell: %s", (declaration) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: [
          "@@ -20,1 +20,4 @@",
          "       - name: Ensure labels",
          `+${declaration}`,
          "+        false",
          "+        gh label create demo || true",
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/labels.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it("keeps commands independent under a commented literal header", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: [
          "@@ -20,1 +20,4 @@",
          "       - name: Ensure labels",
          "+      run: | # literal",
          "+        false",
          "+        gh label create demo || true",
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
  });

  it.each([
    {
      name: "plain scalar",
      firstLine: "run: false",
      suppression: "  gh label create demo || true",
    },
    {
      name: "single-quoted scalar",
      firstLine: "run: 'false",
      suppression: "  gh label create demo || true",
      closingLine: "  trailing text'",
    },
    {
      name: "double-quoted scalar",
      firstLine: 'run: "false',
      suppression: "  gh label create demo || true",
      closingLine: '  trailing text"',
    },
  ])(
    "blocks an allowlisted line folded into a multiline $name",
    ({ firstLine, suppression, closingLine }) => {
      const contextLines = closingLine ? 2 : 1;
      const result = detectCiIntegrity([
        {
          filename: ".github/workflows/labels.yml",
          patch: [
            `@@ -1,${contextLines} +1,${contextLines + 1} @@`,
            ` ${firstLine}`,
            `+${suppression}`,
            ...(closingLine ? [` ${closingLine}`] : []),
          ].join("\n"),
        },
      ]);

      expect(result.blockingPatterns).toEqual([
        '.github/workflows/labels.yml: workflow bypass pattern "|| true"',
      ]);
    },
  );

  it("keeps a plain multiline run command independent after a blank line", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: [
          "@@ -1,2 +1,3 @@",
          " run: false",
          " ",
          "+  gh label create demo || true",
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
  });

  it.each([
    {
      name: "plain scalar with both lines added",
      patch: [
        "@@ -1,0 +1,2 @@",
        "+run: gh label create demo || true",
        "+  || npm test",
      ].join("\n"),
    },
    {
      name: "folded block scalar with both lines added",
      patch: [
        "@@ -1,0 +1,3 @@",
        "+run: >",
        "+  gh label create demo || true",
        "+  || npm test",
      ].join("\n"),
    },
    {
      name: "plain scalar with an unchanged suppression",
      patch: [
        "@@ -1,1 +1,2 @@",
        " run: gh label create demo || true",
        "+  || npm test",
      ].join("\n"),
    },
    {
      name: "folded block scalar with an unchanged suppression",
      patch: [
        "@@ -1,2 +1,3 @@",
        " run: >",
        "   gh label create demo || true",
        "+  || npm test",
      ].join("\n"),
    },
  ])("revokes an allowed suppression composed with a successor: $name", ({ patch }) => {
    const result = detectCiIntegrity([
      { filename: ".github/workflows/labels.yml", patch },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/labels.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it("does not compose adjacent commands in a literal block scalar", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: [
          "@@ -1,2 +1,3 @@",
          " run: |",
          "   gh label create demo || true",
          "+  npm test",
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
  });

  it.each([
    "run: 'gh label create demo || true'",
    'run: "gh label create demo || true"',
    'run: "gh label create demo --description \\"A & B; C | D\\" || true"',
  ])("decodes a complete quoted YAML run value: %s", (runLine) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: `@@ -1,0 +1,1 @@\n+${runLine}`,
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
  });

  it.each(['"r\\u0075n": >', '"r\\x75n": >-'])(
    "decodes an escaped quoted run key before classifying %s",
    (declaration) => {
      const result = detectCiIntegrity([
        {
          filename: ".github/workflows/labels.yml",
          patch: [
            "@@ -1,0 +1,3 @@",
            `+${declaration}`,
            "+  false",
            "+  gh label create demo || true",
          ].join("\n"),
        },
      ]);

      expect(result.blockingPatterns).toEqual([
        '.github/workflows/labels.yml: workflow bypass pattern "|| true"',
      ]);
    },
  );

  it.each([
    { key: "? run", value: ": >" },
    { key: '? "run"', value: ": >-" },
    { key: '? "r\\u0075n"', value: ": >2-" },
    { key: "- ? run", value: "  : >" },
  ])("recognizes the explicit YAML run key $key", ({ key, value }) => {
    const contentIndent = value.length - value.trimStart().length + 2;
    const content = " ".repeat(contentIndent);
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: [
          "@@ -1,0 +1,4 @@",
          `+${key}`,
          `+${value}`,
          `+${content}false`,
          `+${content}gh label create demo || true`,
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/labels.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it.each([
    {
      name: "tagged implicit key",
      lines: ["+!!str run: >", "+  false", "+  gh label create demo || true"],
    },
    {
      name: "tagged explicit key",
      lines: ["+? !!str run", "+: >", "+  false", "+  gh label create demo || true"],
    },
    {
      name: "explicit block-scalar key",
      lines: ["+? >-", "+  run", "+: >", "+  false", "+  gh label create demo || true"],
    },
  ])("classifies the YAML run-key probe: $name", ({ lines }) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: [`@@ -1,0 +1,${lines.length} @@`, ...lines].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/labels.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it.each([
    {
      name: "double-quoted key with spaced colon",
      declaration: '      "run" : | # comment',
      command: "        gh label create demo || true",
    },
    {
      name: "single-quoted key with tab separators",
      declaration: "      'run'\t:\t|-\t# comment",
      command: "        gh label create demo || true",
    },
    {
      name: "compact sequence mapping with indentation then chomping",
      declaration: "      - run : |2- # comment",
      command: "          gh label create demo || true",
    },
    {
      name: "spaced sequence mapping with chomping then indentation",
      declaration: "      -   'run' : |+2 # comment",
      command: "            gh label create demo || true",
    },
    {
      name: "anchor then tag properties",
      declaration: "      run : &script !!str |+ # comment",
      command: "        gh label create demo || true",
    },
    {
      name: "tag then anchor properties",
      declaration: "      run : !!str &script >- # comment",
      command: "        gh label create demo || true",
    },
  ])("recognizes a run block scalar with $name", ({ declaration, command }) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: [
          "@@ -20,1 +20,3 @@",
          "       - name: Ensure labels",
          `+${declaration}`,
          `+${command}`,
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
  });

  it.each([
    'gh label create demo --description "A & B; C | D" || true',
    "gh label create demo --description 'A & B; C | D' || true",
    "grep -c 'foo|bar;baz&qux' results.txt || true",
    'rg --count "foo|bar;baz&qux" results.txt || true',
    "gh label create demo --description '$(npm test); `literal` | &' || true",
  ])("allows quoted shell-control data in a reviewed command: %s", (command) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: `@@ -1,0 +1,1 @@\n+run: ${command}`,
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
  });

  it.each([
    'gh label create demo --description "$(npm test)" || true',
    'gh label create demo --description "`npm test`" || true',
    'grep -c "$(npm test)" results.txt || true',
    'rg --count "`npm test`" results.txt || true',
  ])("blocks active substitution inside double quotes: %s", (command) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: `@@ -1,0 +1,1 @@\n+run: ${command}`,
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/labels.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it("fails closed when comment-only context cannot prove the hunk is outside a scalar", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch:
          "@@ -10,1 +10,2 @@\n # harmless documentation |\n+gh label create demo || true",
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/labels.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it("fails closed when a hunk starts inside an omitted YAML scalar", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: [
          "@@ -30,1 +30,2 @@",
          '         echo "the run header is outside this hunk"',
          "+        gh label create demo || true",
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/labels.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it.each(["  run: echo harmless", "  label: harmless metadata"])(
    "does not trust mapping-looking context inside an unknown scalar: %s",
    (contextLine) => {
      const result = detectCiIntegrity([
        {
          filename: ".github/workflows/labels.yml",
          patch: [
            "@@ -30,1 +30,2 @@",
            ` ${contextLine}`,
            "+  gh label create demo || true",
          ].join("\n"),
        },
      ]);

      expect(result.blockingPatterns).toEqual([
        '.github/workflows/labels.yml: workflow bypass pattern "|| true"',
      ]);
    },
  );

  it("does not let added YAML-looking text self-certify an ambiguous hunk", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: [
          "@@ -30,0 +30,2 @@",
          "+        run: |",
          "+          gh label create demo || true",
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/labels.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it("recovers after unchanged YAML structure proves an unknown scalar ended", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/labels.yml",
        patch: [
          "@@ -30,2 +30,3 @@",
          "         echo prior scalar content",
          "       shell: bash",
          "+      run: gh label create demo || true",
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
  });

  it.each([
    "npm test || true",
    "npm run build || true",
    "vercel deploy || true",
    "./scripts/verify.sh || true",
    "trap 'npm test || true' EXIT",
    "gh pr checks 42 || true",
    "mkdir generated/report || true",
    "grep needle results.txt || true",
    "gh label create test && npm test || true",
    "grep -c needle results.txt; npm test || true",
    "grep -c needle results.txt | tee count.txt || true",
    "grep -c needle results.txt & npm test || true",
    "gh label create demo & npm test || true",
    "mkdir -p out & npm run build || true",
    "trap 'rm -rf \"$tmp\" & npm test || true' EXIT",
    "gh label create demo < <(npm test) || true",
    "trap 'rm -rf \"$tmp\" < <(npm test) || true' EXIT",
    "gh label create demo &>/dev/null&npm test || true",
    "gh label create demo >&/dev/null&npm test || true",
    "gh label create demo &>$(npm test) || true",
    "gh label create demo &>$(npm_test) || true",
    "gh label create demo &>`npm_test` || true",
    "gh label create demo >&$(npm test) || true",
    "$(grep -c needle results.txt) || true",
    "grep -c one || true || true",
  ])("keeps an unreviewed or composed suppression blocking: %s", (command) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: `@@ -1,1 +1,2 @@\n+        run: ${command}`,
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/ci.yml: workflow bypass pattern "|| true"',
    ]);
    expect(result.score).toBe(45);
  });

  it.each([
    {
      name: "added logical-and predecessor",
      patch:
        "@@ -1,1 +1,4 @@\n+      run: |\n+        npm test &&\n+        gh label create demo || true",
    },
    {
      name: "unchanged logical-and predecessor",
      patch:
        "@@ -10,2 +10,3 @@\n         npm test &&\n+        gh label create demo || true",
    },
    {
      name: "backslash continuation",
      patch:
        "@@ -1,1 +1,4 @@\n+      run: |\n+        npm test \\\n+        gh label create demo || true",
    },
    {
      name: "continuation with an intervening comment",
      patch:
        "@@ -1,1 +1,5 @@\n+      run: |\n+        npm test &&\n+        # still waiting for the RHS\n+        gh label create demo || true",
    },
    {
      name: "continuation with an intervening blank",
      patch:
        "@@ -1,1 +1,5 @@\n+      run: |\n+        npm test &&\n+\n+        gh label create demo || true",
    },
    {
      name: "operator before an inline comment",
      patch:
        "@@ -1,1 +1,4 @@\n+      run: |\n+        npm test && # still waiting for the RHS\n+        gh label create demo || true",
    },
    {
      name: "pipe-stderr predecessor",
      patch:
        "@@ -1,1 +1,4 @@\n+      run: |\n+        npm test |&\n+        gh label create demo || true",
    },
    {
      name: "pipe-stderr predecessor before an inline comment",
      patch:
        "@@ -1,1 +1,4 @@\n+      run: |\n+        npm test |& # pipe stdout and stderr\n+        gh label create demo || true",
    },
    {
      name: "unchanged pipe-stderr predecessor",
      patch: [
        "@@ -10,3 +10,4 @@",
        "       - name: Test",
        "         run: |",
        "           npm test |&",
        "+          gh label create demo || true",
      ].join("\n"),
    },
    {
      name: "ambiguous hunk boundary followed by an added comment",
      patch: "@@ -10,0 +10,2 @@\n+# no boundary evidence\n+gh label create demo || true",
    },
    {
      name: "folded YAML scalar predecessor",
      patch:
        "@@ -1,1 +1,4 @@\n+      run: >\n+        npm test\n+        gh label create demo || true",
    },
    {
      name: "headerless patch boundary",
      patch: "+gh label create demo || true",
    },
  ])("blocks an allowlisted physical line continued from a $name", ({ patch }) => {
    const result = detectCiIntegrity([{ filename: ".github/workflows/ci.yml", patch }]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/ci.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it.each([
    {
      name: "plain multiline scalar",
      lines: ["+run: npm test ||", "+  true"],
    },
    {
      name: "folded block scalar",
      lines: ["+run: >", "+  npm test ||", "+  true"],
    },
    {
      name: "literal block shell continuation",
      lines: ["+run: |", "+  npm test ||", "+  true"],
    },
    {
      name: "quoted RHS after a split operator",
      lines: ["+run: |", "+  npm test ||", '+  "true"'],
    },
    {
      name: "operator with an escaped newline",
      lines: ["+run: |", "+  npm test || \\", "+  true"],
    },
    {
      name: "operator glyphs joined by an escaped newline",
      lines: ["+run: |", "+  npm test |\\", "+  | true"],
    },
    {
      name: "operator with intervening comment and blank",
      lines: ["+run: |", "+  npm test ||", "+  # RHS follows", "+", "+  true"],
    },
  ])("blocks split OR-TRUE syntax in a $name", ({ lines }) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: [`@@ -1,0 +1,${lines.length} @@`, ...lines].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/ci.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it("blocks a split suppression completed by an added RHS", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: "@@ -1,1 +1,2 @@\n run: npm test ||\n+  true",
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/ci.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it("blocks an added OR successor after an omitted-scalar context suppression", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: [
          "@@ -20,1 +20,2 @@",
          "   gh label create demo || true",
          "+  || npm test",
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/ci.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it.each([
    'run: echo "|| true"',
    "run: echo '|| true'",
    "run: echo complete # || true is documentation",
    'run: echo "still data: || true" # trailing comment',
  ])("ignores non-executing suppression text: %s", (runLine) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: `@@ -1,0 +1,1 @@\n+${runLine}`,
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
    expect(result.score).toBe(0);
  });

  it.each([
    {
      name: "plain scalar YAML comment",
      lines: ["+run: gh label create demo || true", "+  # rationale only"],
    },
    {
      name: "folded scalar shell comment",
      lines: ["+run: >", "+  gh label create demo || true", "+  # rationale only"],
    },
    {
      name: "multiline quoted scalar shell comment",
      lines: ['+run: "gh label create demo || true', '+  # rationale only"'],
    },
  ])("does not revoke a safe suppression followed by a $name", ({ lines }) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: [`@@ -1,0 +1,${lines.length} @@`, ...lines].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
  });

  it.each([
    {
      name: "sequence anchor",
      lines: ["+- &run_key run: >", "+    false", "+    gh label create demo || true"],
    },
    {
      name: "tag then anchor",
      lines: ["+!!str &run_key run: >", "+  false", "+  gh label create demo || true"],
    },
    {
      name: "anchor then tag",
      lines: ["+&run_key !!str run: >", "+  false", "+  gh label create demo || true"],
    },
  ])("recognizes a run key with $name properties", ({ lines }) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: [`@@ -1,0 +1,${lines.length} @@`, ...lines].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/ci.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it.each([
    'run: "gh label create demo\\nnpm test || true"',
    "run: gh label create demo ${{ env.EXTRA }} || true",
  ])("blocks an allowlist prefix with executable interpolation: %s", (runLine) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: `@@ -1,0 +1,1 @@\n+${runLine}`,
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/ci.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it.each([
    {
      name: "multiple escaped-newline joins",
      lines: ["+run: |", "+  npm test |\\", "+  | tr\\", "+  ue"],
    },
    {
      name: "empty quote word concatenation",
      lines: ["+run: npm test || t''rue"],
    },
    {
      name: "backslash word concatenation",
      lines: ["+run: npm test || tr\\ue"],
    },
    {
      name: "decoded multiline YAML operator",
      lines: ['+run: "npm test \\u007c\\u007c', '+  true"'],
    },
    {
      name: "folded shell quote closure",
      lines: [
        "+run: >",
        "+  gh label create demo --description 'A",
        "+  ' ; npm test || true",
      ],
    },
    {
      name: "outer-quoted shell quote closure",
      lines: [
        "+run: \"gh label create demo --description 'A",
        "+  ' ; npm test || true\"",
      ],
    },
    {
      name: "static expression containing the fallback",
      lines: ["+run: npm test ${{ '|| true' }}"],
    },
    {
      name: "static expression containing the operator",
      lines: ["+run: npm test ${{ '||' }} true"],
    },
    {
      name: "run value alias",
      lines: [
        "+env:",
        "+  COMMAND: &cmd 'npm test || true'",
        "+jobs:",
        "+  t:",
        "+    runs-on: ubuntu-latest",
        "+    steps:",
        "+      - run: *cmd",
      ],
    },
    {
      name: "explicit run key alias",
      lines: [
        "+name: p",
        "+on: push",
        "+env:",
        "+  KEY: &rk run",
        "+jobs:",
        "+  t:",
        "+    runs-on: ubuntu-latest",
        "+    steps:",
        "+      - ? *rk",
        "+        : >",
        "+            false",
        "+            gh label create demo || true",
      ],
    },
    {
      name: "non-specific tagged run key",
      lines: ["+- ! run: >", "+    false", "+    gh label create demo || true"],
    },
  ])("blocks a semantically constructed OR-TRUE via $name", ({ lines }) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: [`@@ -0,0 +1,${lines.length} @@`, ...lines].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/ci.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it.each(["+  || npm test", "@@ -20,0 +20,1 @@\n+  || npm test"])(
    "fails closed for a truncated leading OR successor: %s",
    (patch) => {
      const result = detectCiIntegrity([{ filename: ".github/workflows/ci.yml", patch }]);

      expect(result.blockingPatterns).toEqual([
        '.github/workflows/ci.yml: workflow bypass pattern "|| true"',
      ]);
    },
  );

  it.each([
    {
      name: "folded block comment",
      lines: ["+run: >", "+  npm test ||", "+  # rationale", "+  true"],
    },
    {
      name: "outer-quoted comment",
      lines: ['+run: "npm test ||', "+  # rationale", '+  true"'],
    },
    {
      name: "false RHS",
      lines: ["+run: |", "+  npm test ||", "+  false"],
    },
    {
      name: "failing exit RHS",
      lines: ["+run: |", "+  npm test ||", "+  exit 1"],
    },
  ])("does not flag a failure-preserving $name", ({ lines }) => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: [`@@ -0,0 +1,${lines.length} @@`, ...lines].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
  });

  it("preserves literal block newlines around a split fallback comment", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: [
          "@@ -0,0 +1,4 @@",
          "+run: |",
          "+  npm test ||",
          "+  # rationale",
          "+  true",
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/ci.yml: workflow bypass pattern "|| true"',
    ]);
  });

  it("keeps the suppression policy data reviewable", () => {
    const ids = OR_TRUE_SUPPRESSION_ALLOWLIST.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of OR_TRUE_SUPPRESSION_ALLOWLIST) {
      expect(rule.justification.trim()).not.toBe("");
      expect(rule.justification).not.toMatch(/[\r\n]/);
    }
  });

  it("keeps the committed MCP runtime on the canonical suppression taxonomy", async () => {
    const mcp = await import("../../mcp/dist/ci-integrity.js");
    const allowedFiles = [
      {
        filename: ".github/workflows/labels.yml",
        patch: '@@ -1,1 +1,2 @@\n+ gh label create "$1" --color "$2" || true',
      },
    ];
    const blockedFiles = [
      {
        filename: ".github/workflows/test.yml",
        patch: "@@ -1,1 +1,2 @@\n+ npm test || true",
      },
    ];

    expect(mcp.detectCiIntegrity(allowedFiles)).toEqual(detectCiIntegrity(allowedFiles));
    expect(mcp.detectCiIntegrity(allowedFiles).score).toBe(0);
    expect(mcp.detectCiIntegrity(blockedFiles)).toEqual(detectCiIntegrity(blockedFiles));
    expect(mcp.detectCiIntegrity(blockedFiles).blockingPatterns).toHaveLength(1);
  });

  it("still blocks a real bypass added alongside a trap cleanup line", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: [
          "@@ -1,2 +1,4 @@",
          "+          trap 'docker rm --force \"$cid\" || true' EXIT",
          "+          npm test || true",
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([
      '.github/workflows/ci.yml: workflow bypass pattern "|| true"',
    ]);
    expect(result.score).toBe(45);
  });
});
