---
task: "1059"
pass: 4
at: "2026-11-08T13:16:53.744Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/check-gate-skip-the-full-suite-when-the-
state: ok
tree_identity: "75bb70683:75bb70683a"
---
## Verdict
needs some work — profile-excluded steps still push docs-only progress past its total; required fallback coverage is missing.

## Relevance
still relevant — `main` has no implementation of this shortcut; #1055’s rework did not address the check-gate cost.

## Evidence
None

## Bugs
- **Progress accounting — `src/commands/check.ts:2015-2028`:** `stepsTotal` excludes profile-skipped steps, but the docs-only branch pushes a result for each before honoring `skip`, and `stepsDoneCount` counts every result. A docs-only run with profile-excluded steps can report progress beyond 100%. This residual case from the prior review is not covered by the new progress test.
- **Required fallback coverage — `src/ui-app/tests/check-skip-outcome.test.ts:156-161`:** the changed-ref failure test uses a planless fixture, which exits before running any steps; it verifies the warning, not that the full plan runs. The docs-only runner test also passes `docsOnly: true` directly, bypassing path classification. The required CLI-level full-path fallback is therefore unverified.

## Edge cases
The “Docs-only check setting” capture shows the enabled switch on Advanced; the route matched, no console errors were recorded, and the intervening tree changes were bookkeeping-only.

## Suggestions
Clarify `user-docs/check.md`’s Markdown exclusions: the classifier also forces full checks for `tests/` and `.githooks/`. No new bare `node`, `npm`, or `npx` invocation found.

## Verdict
needs some work — profile-specific progress is incorrect, and required full-path fallback coverage is absent.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-08T12:58:18.374Z).
- Guard `lockfile-sync`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-runner.test.ts.
- Guard `zero-runtime-deps`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-runner.test.ts.

