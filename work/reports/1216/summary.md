## TL;DR

Task 1216 was a QA pass over the empty, loading and error states of the Agents, Checks and Releases pages. The pages already had largely sound states; the pass made initial-load errors on Checks and Releases announce via `role="alert"`, then found and fixed a real bug in round 2: a failed initial config request left the Agents page on its skeleton indefinitely with no retry path. Agents now shows an accessible error card with Retry. All states were verified headlessly with Playwright at 375, 768 and 1280 px (27 captures, no overflow, no page errors), `docs/qa/2026-11-empty-error-states-qa.md` was committed, and the task closed as `good to go` after two dev rounds and two review passes.

## Outcome

What shipped (merged commit `5aca538c0c3fa731667f7fe775074c5f20e20553`):

- **Agents:** an initial-load error card with `role="alert"`, plain-language connection guidance and a Retry action calling `config.load()`. The skeleton now appears only when loading without an error, and raw config errors no longer leak into the page subtitle while configuration is unloaded. A responsive card style wraps the button on narrow screens.
- **Checks:** the first-load error branch now uses `role="alert"`, while refresh failures on cached content keep `role="status"` (a regression test pins this distinction).
- **Releases:** the initial status-load failure branch now uses `role="alert"`; refresh errors remain status announcements since prior data stays visible.
- **Docs:** `docs/qa/2026-11-empty-error-states-qa.md` committed, recording the state review, the headless verification matrix and its limits.
- **Tests:** focused UI tests extended (agents-view-cards +38 lines, checks-page-default-tab +1); the round-2 run passed 284 scoped tests locally plus format, lint, build, CSS, contrast and UI smoke checks.

**Final verdict: `good to go`** (review pass 2, 2026-11-19T04:07:53Z). Status `done`, release succeeded at 2026-11-19T04:17:15Z.

## Process stats

- **Wall-clock, creation to done:** 2026-11-19T03:17:43Z → 2026-11-19T04:17:15Z = 59m 32s.
- **Dev rounds:** 2, both by the engineer agent (`codex`, model `gpt-6-luna`). Round 1 reported 2026-11-19T03:42:42Z; round 2 reported 2026-11-19T04:07:04Z after the task bounced back to `active`.
- **Review passes:** 2, both reviewer agent `codex`, model `gpt-6-luna` — pass 1 (03:43:27Z) `needs some work`, pass 2 (04:07:53Z) `good to go`. Reviewer sessions: 42s / 225,088 tokens and 46s / 233,607 tokens.
- **Engineer session:** elapsed 1762s, 25,818,650 tokens. Cost not recorded (all cost fields blank).
- **Total recorded tokens:** 26,277,345 (engineer 25,818,650 + both reviewer passes). Routing sessions (3, "Model router (openrouter)", model "unknown") recorded no token counts.
- **Restarts or agent swaps:** none recorded. The engineer continued across both rounds on the same branch.
- **Close-out gate:** completed in 168s.

## What went wrong

- **Review pass 1 failed the task back (`needs some work`):** the required headless Playwright verification at 375, 768 and 1280 px was not evidenced; the single handoff capture showed the default Control page, which exercises none of the changed pages. The round-1 report had honestly flagged this gap itself. Resolved in round 2 by running the full 27-capture matrix (3 pages × 3 states × 3 widths) through the managed task preview.
- **Round 2 found a genuine bug, not just missing evidence:** the config store sets an error while keeping `loaded` false, and Agents keyed its skeleton to `!loaded` — a failed `/api/config` request left the skeleton up indefinitely with the error buried in the subtitle. Fixed with the alert card + Retry described above.
- **Stale preview build:** the already-running task preview still served the previous build, so the new Agents error UI was absent from the first capture run. Resolved by rebuilding the UI and restarting the managed preview before treating any captures as final.
- **Wrong fixture for Checks empty state:** the first empty response used a declared empty plan, which intentionally does not trigger the special reminder; the fixture was corrected to the domain's genuine empty-plan source (`source: "empty"`, no steps) and the reminder itself asserted.
- **Raced screenshot:** one mobile Agents error capture raced the response; the final matrix waits for each expected state selector before screenshotting.
- **Stale handoff shot:** pass 2 noted the recorded handoff capture did not show the declared Agents/Checks/Releases routes; it was treated as not the only evidence and did not block sign-off. The automatic shot was skipped because the engineer-made capture pre-empts it (04:07:05Z).
- **Orphaned processes:** two orphaned run processes from this task were stopped at 04:12:57Z and 04:13:12Z (pid 35762, a `bun run build && serve --port 50602` shell, and pid 37209, the task runner process), each ~16m old. No impact on the outcome was recorded.
- **Two CTO-nudge holds** for in-progress gates (handoff gate at 03:28:11Z, remote validation at 03:43:31Z) were normal queueing, resolved when the gates finished.

## Learnings

- **A store can hold an error while `loaded` is still false.** A view that keys its skeleton only on `!loaded` can conceal a failure forever; loading indicators must account for the error state, and the error needs a direct recovery action. Worth a convention line in `docs/agent-ui-and-preview-conventions.md` for future state reviews.
- **Initial-load vs refresh error semantics:** a failed initial load warrants `role="alert"` (no usable data on the page); a failed refresh over retained content warrants `role="status"`. The round-1 report articulated this cleanly — it is a project-wide a11y pattern that could live in the UI conventions doc and be applied to any remaining views.
- **Fixture evidence is not viewport evidence.** Unit-mounted view tests with stubbed fetches prove state transitions and copy, not layout. Round 1 claimed neither, and the review still failed the task for missing viewport proof — QA acceptance criteria that name specific widths need that exact matrix run before handoff, not an honest disclaimer.
- **Checks has a domain distinction between an empty *valid* plan and an empty *declared* plan** (only the former triggers the setup reminder). Fixtures must preserve that distinction to exercise the intended message.
- **A viewport assertion is stronger when it checks both expected-state visibility and actual document width**, and every capture should wait for its state selector, not just navigation.
- The round-2 pattern of discovering a real bug only once viewport verification was actually run supports the existing rule that state QA passes must include the headless capture matrix, not rely on prior unit coverage. If it recurs, fold the principle into `AGENTS.md`'s definition of done rather than leaving it only in this report.

## Follow-ups

None.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
