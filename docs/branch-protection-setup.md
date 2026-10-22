# Configure required checks safely

Trailhead policy and GitHub branch protection are separate controls. Declaring a
required CI job in `.trailhead.yml` does not make GitHub require Trailhead itself.
An administrator configures the protected branch or ruleset after verifying the
check on real PRs. This guide does not change repository settings.

## 1. Inventory the existing protection

For each integration, staging and production branch, record the existing required
checks and their publishing apps, strict/up-to-date setting, reviews, code-owner
requirements, bypass permissions, and applicable organization rulesets. Preserve
them during migration. Do not replace the whole rule with a short example list.

## 2. Configure the composite gate

Use `schema_version: 2` and `gate.mode: release-ready`. List the actual CI check
names under the matching context's `ci.required_checks`, use
`ci.missing_required: fail` for mandatory jobs, and enable `wait-for-checks: true`.
Do not include the composite check itself in its input list. Keep tests, audit,
security and build jobs running on every relevant PR and promotion base.

For a production policy that must stop on evaluator errors, explicitly choose the
Action input `fail-mode: closed`; the product default remains fail-open. Keep
independent safety checks such as `security-guard` and Lodge's production evidence
check required even if a composite reports green. They enforce separate review or
cross-system evidence requirements. Advisory/risk-only mode is not a replacement
for a CI-enforcing required check.

## 3. Verify the published identity and behavior

Run a test PR and inspect the custom check on its exact head SHA. The default
custom name is **Trailhead — Release Ready**, but a repository may configure a
different name. Select the publishing GitHub App (GitHub Actions for GITHUB_TOKEN)
as the expected source. Distinguish the custom check from the workflow job with
the same display name; verify the check's release brief and publication details.

Test passing, failed, pending and missing required jobs, then a new PR head.
Check that failures and missing mandatory inputs prevent release readiness and
that results from the old head are not accepted for the new one. Inspect skipped
jobs explicitly: GitHub can accept skipped/neutral conclusions, so a skipped
required name alone does not prove the underlying test ran. Use the repository's
reviewed applicability policy and keep independent guards for unconditional work.

## 4. Add protection, then consider removing redundancy

In repository Settings, edit the existing branch protection rule or ruleset. Add
the verified custom check with its expected source while retaining the old
required checks and review restrictions. Confirm on another PR that GitHub blocks
when the new check is absent or failed. Keep the existing strict/up-to-date mode.

Only after the repository's calibration and review criteria are satisfied may an
administrator remove a genuinely redundant legacy aggregate such as CI Gate.
Do not remove security, approval or evidence checks merely because they appear in
the release brief. Komatik's ADR-011 calibration and fleet soak criteria still
apply; a green sample does not satisfy them.

## Rollback and troubleshooting

Restore the prior verified required-check set before switching Trailhead to
advisory or risk-only. Leave tests, audit and review requirements enabled.
For an expected check that never appears, inspect its exact name, app source,
head SHA and workflow base-branch/path filters. Fix publication or configuration;
do not use an administrator bypass to conceal a missing result.

GitHub references: [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches),
[required-check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).
