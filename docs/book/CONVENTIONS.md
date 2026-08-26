# Living Docs conventions

The book is standing, human-readable explanation. Per-run state remains in the engine cycle ledger and evidence bundle; a book paragraph may explain a durable rule, but it must not copy a run row that will change.

## Structure

- A section is one of the five top-level folders and owns a filing boundary.
- A section file contains exactly its H1 and one prose scope paragraph; extra notes are unfiled content.
- A chapter is a Markdown file with strict frontmatter, one stable topic, and an explicit display order.
- A paragraph is a titled atomic claim with a globally unique, location-independent `p-<concept-slug>` identifier.
- Every paragraph places `<a id="p-..."></a>` immediately before its H3 heading so the address works in rendered Markdown as well as the generated index.

Paragraph identifiers are immutable and never reused. Moving a paragraph does not change its identifier, and a landed paragraph is never renamed or replaced by a redirect. `redirects.json` is append-only and exists only for imported legacy aliases that were never paragraph anchors in an earlier book snapshot. Generated `anchors.json` is never edited by hand. A chapter split records its old file path in authored `chapter-redirects.json`; it does not create paragraph redirects because the paragraph addresses stay unchanged.

## Paragraph shape

Each paragraph contains one concept title of at most ten words, one to six prose sentences, and one final provenance line. Lists and event logs are not paragraphs.

```markdown
<a id="p-concept-address"></a>
### Concept address {#p-concept-address}

One durable claim belongs here.

> since YYYY-MM-DD · verified YYYY-MM-DD · confidence ratified · sources: `pr:<number>`
```

A superseded paragraph appends `· superseded YYYY-MM-DD by [[p-replacement-id]]` to that line. A retired paragraph with no replacement appends `· retired YYYY-MM-DD`. Neither lifecycle state removes the historical paragraph or its anchor.

The closed source vocabulary is `david:`, `pr:`, `commit:`, `cycle:`, `finding:`, `adr:`, `doc:`, `mem:`, and `tmp:`. Every ref must resolve. Repository sources resolve against trusted `origin/dev`: PRs must be merged there, commits must be full 40-character ancestor SHAs, and ADRs must be accepted. `doc:` cannot bypass that rule by citing `docs/proposals/`; point-in-time `docs/reports/` are discovery inputs, not ratifying authority; and `docs/audit/`, `docs/strategy/`, and the book itself are also refused. David rulings use `david:YYYY-MM-DD#ruling-slug` and must already exist in trusted `origin/dev`; a ruling added in the same patch cannot ratify that patch, so recording and citing a new ruling are deliberately two reviewed steps. Off-repo `mem:` and dated `tmp:` refs must have a captured date and SHA-256 digest in append-only `external-sources.json`. A paragraph with at least one reviewed repository or ruling source is `ratified`; a paragraph backed only by `mem:` or `tmp:` sources is `reported` and cannot serve as ground truth for another paragraph.

## Filing operations

- `ADD` creates a genuinely new concept and states why no existing paragraph covers it.
- `UPDATE` edits an existing paragraph in place, advances its verification evidence, and preserves its identifier.
- `SUPERSEDE` creates the replacement while retaining the old paragraph and linking it to the new identifier.
- `NOOP` records that an existing paragraph already covers the candidate fact without changing the book.

Filing means placing or revising knowledge where it belongs, not appending a chronology. A content-only patch made entirely of trailing additions requires explicit new-paragraph or new-chapter declarations for human review.

For the bounded Stage 1 contract, canonical section metadata and chapter lifecycle status are frozen. Scope or lifecycle governance changes require a later ratified contract update; an ordinary filing patch cannot smuggle them through as prose or metadata.

## Stage 1 pilot evidence

The Engine pilot metric is bound to exactly four chapters: `engine/run-cycle`, `engine/codegen-substrate`, `engine/walls-and-floors`, and `engine/measurement-integrity`. It gates exactly 30 **current** paragraphs and reports superseded or retired paragraphs separately as history, so a correction neither preserves a false target count nor makes the target unreachable. The Stage 1 specimen may not contain chapters in another section. The metric refuses to run against a structurally invalid book model.

`pilot-review.json` names `David` or `null` as the reviewer. It records the steer count and answerability result. A completed review must cite a trusted `david:` ruling whose structured `pilot_review` record binds the exact reviewed commit, current-corpus SHA-256, and review-payload SHA-256; an unrelated PR, commit, or ruling cannot substitute. This is a two-PR ceremony: merge the completed review payload first while authority remains safely pending, then merge the ruling that names that exact payload commit and its reported digests. The resolver rereads the four chapter files and review payload at `reviewed_commit` before accepting the ruling. Correction time uses `pending`, `recorded`, or `not_applicable` plus nullable minutes and a note, so a clean pilot never manufactures zero; only `recorded` carries minutes. Model spend likewise carries an explicit `status`, `amount_usd`, and `note`: `pending`, `recorded`, `unavailable`, or `not_applicable`, with an amount only when recorded. Unavailable or not-applicable spend cannot be treated as zero or silently pass D11.

## Trust and safety

`since` records when the claim became true; `verified` records the latest source check. Chapter pins identify the artifacts whose drift can invalidate the chapter. A date bump without evidence is not verification.

Secret values, personal contact details, live infrastructure topology, unresolved security findings, and commercial terms do not belong in this book. The scanner blocks value-shaped secrets, domestic and international phone numbers, contact details, and internal, managed-cloud, or Komatik service hostnames. Its narrow example allowlist admits reserved `example.*`/`.invalid` names, documentation-only IP ranges, fictional `555-01xx` phone numbers, localhost, public Komatik roots, and named public documentation hosts; new exceptions require code review rather than prose markers. The source allowlist excludes restricted audit and strategy surfaces; human review remains the semantic gate for audience-tiered prose. Use safe handle names or pointers to the owning restricted surface, never the sensitive value itself.

Run `npm run book:hooks:install` once per clone to activate the tracked hooks. The pre-commit gate scans exact staged blobs, while CI repeats the full-tree scan and every structural check.

## Repo-native Project Books

A standalone product keeps its authored Book in that product repository. `docs/book/project.json` selects the portable Project Book profile and contains exactly the stable project id, display title, canonical `owner/repository`, GitHub default branch, user audience, and preview/current status. A Project Book does not carry Komatik's `pilot-review.json`; its generated artifacts are `book.json`, `anchors.json`, `references.json`, and `index.md`, while Komatik stores a reviewed, commit-pinned projection for Teams.

The stable cross-repository address is `book:<project-id>#<paragraph-id>`. Project titles, repository capitalization, chapter paths, and paragraph headings are presentation and may change. The project id and paragraph id are identity and do not. A central projection must bind the source repository, exact reviewed commit, chapter artifact digests, and complete projection digest before it is shown.

Firn's content graph supplies the reference pattern: prose points at identity instead of a mutable name, missing targets remain visibly broken, and generated indexes support both target-to-source and source-to-target navigation. Living Docs deliberately keeps stricter lifecycle semantics than Firn entities. It never hard-deletes or destructively merges a landed paragraph, never reuses an old id, and never repairs an ambiguous reference by title, chapter number, or display order. Moves preserve the paragraph id; replacements use explicit supersession; imported aliases use reviewed one-hop redirects.

Merged pull requests are the primary history ledger, not the Book's table of contents. Backfill selects era-defining product changes, verifies them against the merged tree, and files the durable explanation where a reader will look for it. Promotion pull requests establish release state but collapse into the product event they carried; closed-unmerged work, dependency noise, formatting, and temporary probes normally resolve to `NOOP`. A Project Book must distinguish default-branch truth from production truth whenever those branches differ.
