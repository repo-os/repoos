---
updated_at: "2026-09-30T03:33:43Z"
review_passes: 4
id: "0592"
title: Skip check gate (with actionable reminder) when a repo has no check plan
type: feature
status: review
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: The reviewer sent this back to the engineer 2 times and still found issues. Human review needed.
priority: p2
area: [core, web]
assigned_to: ai
created_by: ""
branch: feat/skip-check-gate-with-actionable-reminder
model_override: opencode-go/glm-5.3-flash
review_model_override: opencode-go/mimo-v2.6-flash
created_at: "2026-09-30T00:01:23Z"
review_rounds: 2
last_check_failure: "repoos check at 2026-09-30T01:29:36.315Z: server-side finalization timed out (deadline exceeded)"
handoff_signal_retry_count: 1
---
## Problem

In a repo that has no code yet (early planning phase: stories/tasks/docs only), finalization fails at the check step:

    ✗ Server finalization stopped at check: repoos check failed: ... No check plan: this repo declares no [[check.steps]] and nothing could be inferred from it ...

Every handoff to review is blocked until the user invents checks for code that doesn't exist. Reported from the `neung` repo on the canary.

The failure is deliberate today (`src/commands/check.ts`, "a gate that ran nothing is not a gate"; documented in `user-docs/check.md` under "When a repo declares nothing" and "Bootstrapping a plan"). The concern is valid — an empty plan must never render as a green "checks passed" — but hard-failing is the wrong answer for a repo with nothing to verify.

## Change

1. **Add a third check outcome, `skipped`, alongside passed/failed.** When the resolved plan has zero steps AND zero errors (no declared `[[check.steps]]`, no legacy `[check]` keys, nothing inferable), `repoos check` exits 0 and prints a clear "No check plan configured — nothing to verify" message with the setup guidance below. A plan with `errors` (malformed config, unresolvable ref, step whose required tool is missing) must still fail exactly as today. `--changed` mode with an unresolvable ref still fails.
2. **Carry `skipped` through the server finalization/close-out pipeline** (handoff check, close-out full gate) so a skipped check does not block `active → review` or Move to done, and is recorded as `skipped` (not `passed`) in the check run record.
3. **Surface it, never as green.** Wherever check results show — task page chip, task Debug tab, review panel / `IntegrationStatusBar.vue`, Move to done — show a neutral/amber "No checks configured" state with the reminder below, not "Checks passed". Update the existing "No check plan was resolved" copy in `IntegrationStatusBar.vue` accordingly.

## The reminder must be actionable

The message (CLI output and UI) should tell the user how to set checks up when ready, not just that they're missing:

- State plainly: nothing was verified because no checks are configured; that's fine while there's no code, but set them up once the app is scaffolded enough to build/test.
- Give the concrete commands: `repoos check --print-plan` (prints a starting `[[check.steps]]` TOML resolved from what's in the repo — works once a `package.json` / `go.mod` / `Cargo.toml` / `gradlew` exists) and point to `user-docs/check.md`.
- Offer two easy paths in the UI reminder:
  - **File a task** "Set up check.steps in repoos.toml" — a one-click action that creates a pre-filled task via the normal task-creation path (`POST /api/tasks`) whose body tells the assigned agent to run `repoos check --print-plan`, review/adjust the proposed steps (format/lint, build, tests, smoke as appropriate for the stack), add them to `repoos.toml`, and verify `repoos check` passes. Suggested to be filed after the first scaffolding task lands.
  - **Copy/paste the CLI hint** for doing it by hand.
- Avoid nagging on every task: show the full reminder on the check result and in the UI; keep the CLI line to a few lines.

## Docs

Update `user-docs/check.md` (the "Bootstrapping a plan" paragraph and "When a repo declares nothing" item 3, which currently say the gate fails), and any `docs/close-out-pipeline.md` text describing check failure on an empty plan. Keep the "never green" invariant explicit in the docs.

## Acceptance

- Empty plan + no errors: `repoos check` exits 0 with outcome `skipped`; a task in such a repo can hand off to review and close out.
- Plan with errors, or unresolvable `--changed` ref: still exits non-zero.
- Check run record stores `skipped` distinct from `passed`; UI never shows it as passed.
- UI reminder includes the `--print-plan` command and the file-a-task action, with a test.
- Tests cover CLI exit code/message, finalization with a skipped check, and the UI state.

## Out of scope (possible follow-ups)

- `[check] requirePlan = true` strict switch (would need a Settings UI control).
- Auto-nudging when inference first finds a recognizable stack.

## Activity

- 2026-09-30T00:01:23Z · created · unknown
- 2026-09-30T00:03:43Z · model_override
- 2026-09-30T00:03:47Z · review_model_override
- 2026-09-30T00:03:57Z · status inbox→ready
- 2026-09-30T00:04:03Z · status ready→active, branch
- 2026-09-30T00:46:33Z · status active→review
- 2026-09-30T00:46:34Z · status review→active
- 2026-09-30T01:52:25Z · status active→review
- 2026-09-30T02:02:17Z · status review→active
- 2026-09-30T02:17:24Z · status active→review
- 2026-09-30T02:28:14Z · status review→active
- 2026-09-30T02:36:29Z · status active→review
- 2026-09-30T02:49:16Z · needs_input
- 2026-09-30T02:58:36Z · status review→active
- 2026-09-30T02:58:36Z · needs_input
- 2026-09-30T03:21:31Z · status active→review
- 2026-09-30T03:33:43Z · needs_input

