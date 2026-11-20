## TL;DR

Task 1254 was a fixture-based QA pass over the Stories create, link and progress flows at 375, 768 and 1280 px. It shipped one engineering round: a new headless WebKit test suite (`stories-create-progress-qa-browser.test.ts`), two small product fixes (a visible reason on the disabled Create story button; a next step in the duplicate-name error), a race fix in the sign-in QA suite's text-wait helper, and the required QA record at `docs/qa/2026-11-story-flows-qa.md`. The first handoff failed a remote gate on an unrelated flaky assertion (#1239's sign-in suite) and a queued message stalled until a watchdog restart; the second handoff passed, review returned `good to go` in one pass, and close-out finished with release success.

## Outcome

Shipped, merged as `cfcff2aca5ac0843c7c1c4d2b2ad809000e10729`:

- **New coverage:** `src/ui-app/tests/stories-create-progress-qa-browser.test.ts` (+555 lines) mounts the real components in jsdom against seeded stores and stubbed `fetch`, then audits the markup in headless WebKit at all three widths. It covers story creation, duplicate names (409), server failure, unreachable server, zero-task and 40-task progress roll-ups, and the story panel. No visible browser was opened and no live-server calls were made, per the acceptance criteria.
- **Product fix 1:** `NewStoryPanel.vue` previously disabled the Create story button with no explanation. It now shows "Add a description to create the story." (a new `.ff-hint` rule in `style.css`) while the description is empty.
- **Product fix 2:** duplicate-name errors from `writeStoryDefinition` / `rewriteStoryDefinition` (`src/core/story-definition-files.ts`) now end with "Choose a different name." The 409 detection in the route is unchanged (still matches "already exists").
- **Flake fix:** `textOf` in `src/ui-app/tests/sign-in-users-qa-browser.test.ts` used to return as soon as the error element had any text, then assert on it — a transient message could win the race. It now takes an expected matcher and waits until the text matches it; all call sites pass the matcher.
- **QA record:** `docs/qa/2026-11-story-flows-qa.md` (+43 lines), which honestly records the one remaining gap (below).

Paths already correct before this task (case-insensitive duplicate rejection via `storyKey`, zero-task 0% progress) gained regression coverage rather than fixes. Deliberately not done: a client-side duplicate-name pre-check (server remains the authority on names) and any change to tag-only story merging, which is recorded in the QA doc as a product follow-up.

**Known coverage gap, documented not fixed:** linking and unlinking via the task drawer's Story select is not verified in a browser at each width — the existing audit helpers don't mount the drawer. `task-drawer-story-select.test.ts` covers the new-task unlink path only.

**Final verdict:** review pass 1 returned `good to go` (flagged evidence-gap-only: the auto shot showed the dashboard, not the changed dialog). Status `done`, `release:success`.

## Process stats

- **Wall-clock, creation → done:** 2026-11-19T23:27:29Z → 2026-11-20T02:32:11Z = 3h 04m 42s.
- **Engineering rounds:** 1 (Round 1). **Review passes:** 1.
- **Engineer:** Claude Code on `haiku`; session started 2026-11-19T23:27:45Z, elapsed 1326s, 17949 tokens, $0.04350017, finished.
- **Reviewer:** `opencode-go/glm-5.3-flash`; started 2026-11-20T01:18:37Z, elapsed 245s, 41003 tokens, $0.01508161, finished.
- **Routing:** Model router (jev), model unknown, 0s elapsed.
- **Combined recorded tokens/cost:** 58952 tokens, $0.05858178 (sum of the two sessions above).
- **Restarts/swaps:** one watchdog restart of the engineer; no model swaps.

## What went wrong

- **First handoff failed a remote gate (2026-11-20T00:36:51Z).** Remote validation failed on `sign-in-users-qa-browser.test.ts` — "tells a locked-out visitor to wait" — on the `thinkpad` runner. The engineer could not reproduce it locally and the stored remote output was unavailable. Resolution: treat the test as the weak point and fix the race in `textOf` (wait for matching text, not any text). Whether this was the exact cause on that runner is unconfirmed; the change removes the race regardless.
- **Handoff recovery failed (2026-11-20T00:36:52Z).** "Handoff recovery attempted · finalization failed." Recovery was superseded by the watchdog restart below.
- **Queued message stalled (2026-11-20T00:36:52Z → 00:40:04Z).** The failure message queued but no live process consumed it; three CTO nudges were held because the handoff gate was running. The watchdog restarted the engineer at 00:39:56 after the message waited ~3m with no live process, and it was delivered at 00:40:04.
- **Second message went undelivered.** The message queued at 01:18:25Z (handoff) was flagged overdue at 02:27:05Z ("still queued after 60m without being delivered") and there is no recorded delivery. The task nevertheless proceeded normally through review and close-out, so it had no visible effect on the outcome.
- **Review evidence gap.** The lone auto shot showed the dashboard instead of the changed New story dialog, because no shot was declared for it. The reviewer judged the code and tests sound anyway; the hint is asserted by the new suite at all three widths. Not corrected in this task.

## Learnings

- A disabled control needs a visible reason, or it reads as broken; a state-based hint is the cheapest fix. Server copy that names a conflict should name the next step too. These are UI conventions — candidates for `docs/agent-ui-and-preview-conventions.md`.
- In jsdom-to-WebKit fixture harnesses, anything not serialized into `innerHTML` is lost: input values, textarea state and listeners; a harness that copies markup must copy that state. Durable harness knowledge — belongs in `docs/agent-ui-and-preview-conventions.md`.
- A text assertion should wait for the value it asserts, not for any text; "non-empty" lets an earlier transient message win. Fits the flaky-check guidance in `docs/agent-debugging-and-incidents.md`.
- Reviewer-flagged, unfixed instances of the same patterns: `agents-page-qa-browser.test.ts` still uses the old race-prone `textOf`, and `AgentsView.vue:332` has conflict copy with no next step.

## Follow-ups

None filed — the Linked tasks list is empty. The reviewer's suggestions above (the `agents-page-qa-browser.test.ts` `textOf` race and the `AgentsView.vue:332` copy) exist only in the review record, not as tasks.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
