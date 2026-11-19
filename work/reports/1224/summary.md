## TL;DR

Task #1224 QA'd RepoOS's first-run experience — the empty Work, Agents and Checks pages — headlessly at 375, 768 and 1280 px against preview fixtures. Two real defects were found and fixed, both empty states sending mixed signals: the Checks plan tab showed a red "No plan configured" chip plus a redundant red error line directly above the amber "this is fine for now" reminder, and the mobile Work queue told a user with zero tasks "No matching tasks" when no filter was active. To make the Checks first-run state capturable at all, a new `checks:emptyPlan` preview fixture was added (the task forbade touching `repoos.toml`, and the preview board always shows this repo's real plan). Layout was clean at all three widths; all first-run actions worked. The commit included the fixes, two reusable QA scripts and the required report `docs/qa/2026-11-first-run-qa.md`. Review pass 1 returned **good to go**, close-out completed, and the task landed as `done` with release success (merge commit `1c971acbe30dd8c0f2d513a268611810e6d80b47`). The run was bumpy: the primary engineer model was out of quota, the first engineer process crashed and had to be recovered, and the full local test suite was flaky for environmental (memory-pressure) reasons unrelated to the diff.

## Outcome

What shipped:

- **Checks plan tab de-escalation** (`ChecksView.vue`): the `data-source="empty"` chip is now neutral instead of red, and the red error paragraph is suppressed in the genuinely empty case (empty source, zero steps, no errors), where the amber reminder already covers it. The red line is kept — reworded to "No check steps resolved for this repo." — for the odd zero-steps plan whose source is not `empty`. This closes a gap #0592 left: an error-free empty plan must never read as a failure.
- **Mobile Work queue wording** (`MobileWorkQueue.vue`): the count line now distinguishes "No tasks yet" (empty board) from "No matching tasks" (a filter hides existing tasks), matching what the desktop board already did.
- **New `checks:emptyPlan` preview fixture** (`shot-fixtures.ts`, `shot-preview-fixtures.ts`, consumed by `ChecksView.load()`), following the existing pin pattern, so the repo's own committed plan no longer blocks seeing the first-run Checks state.
- **QA scripts** committed under `docs/qa/` (`measure-first-run-widths.mjs`, `first-run-interactions.mjs`) and the QA report `docs/qa/2026-11-first-run-qa.md` (acceptance criterion).
- Tests: a new `checks-empty-plan-first-run.test.ts` (pins the reminder present and zero `.ck-err` lines) plus an extension to `mobile-work-queue.test.ts`.

Final verdict: review pass 1 — **good to go**, no bugs found, still relevant. Automated browser-console check passed (1 of 1 declared shot captured with clean console). Task closed as **done**, release success.

## Process stats

- **Created → done:** 2026-11-19T07:48:01Z → 2026-11-19T09:42:27Z = 1 h 54 min 26 s wall-clock.
- **Engineering rounds:** 1 (recorded round 1). **Review passes:** 1.
- **Agents and models:**
  - Engineer: `opencode` on `opencode-go/glm-5.3-flash` — a fallback, because the primary `codex + gpt-6-luna` pair was paused out of provider usage at 07:48:23Z. The recorded engineer session ran 709 s, 66,431 tokens, $0.02312121, and ended with "the agent process exited with an error" (see below).
  - Reviewer: `opencode` on `opencode-go/glm-5.3-flash`, 246 s, 69,965 tokens, $0.04807568.
  - Debugger: `opencode-go/deepseek-v4.1-flash`, 10 s, no tokens or cost recorded (crash-recovery leg).
  - Model router (jev): two 0 s routing sessions, model unknown, no token/cost data.
  - Model swaps: 1 (the quota-driven fallback at task start). Restarted engineer legs: 1 crash recovery + 1 watchdog restart, neither with recorded token/cost figures.
- **Tokens/cost totals where known:** 136,396 tokens and $0.07119689 across the two sessions that report them; the remaining sessions record none.
- **Close-out gate:** completed in 489 s.

## What went wrong

- **Primary engineer model unavailable at dispatch.** `codex + gpt-6-luna` was paused since 07:09:32Z ("hit your usage limit"); the runner fell back to `opencode + opencode-go/glm-5.3-flash` per its fallback rule. Resolved automatically; no action needed.
- **Engineer process crashed.** At 08:22:31Z the agent process exited with an error; an orphaned engineer (pid 81043) was stopped and crash recovery resumed the same agent/model pairing (1/3 crashes in 30 m). A debugger session (10 s) ran on the crash. The task briefly went to `needs_input` at 08:22:39Z, then body updates resumed from 08:22:49Z onward.
- **Orphaned run processes accumulated.** The watchdog stopped 19 orphans across the session: an age-30 m `just serve-noauth 7272` (pid 94299), a 20 s-old `serve-noauth 7279` (pid 2869), a worktree QA process (pid 3031), and sixteen short-lived `sleep 60` helpers. All stopped cleanly.
- **Handoff gate stall.** At 09:00:19Z a CTO nudge recorded the task as held with the handoff gate running. UI verification passed at 09:11:58Z (1 of 1 shot, clean console), but the queued handoff message then waited ~3 m with no live process, so the watchdog restarted the engineer at 09:15:05Z and delivered the message. Second verification passed at 09:28:37Z and the task moved to review. Resolved by the watchdog; no data lost.
- **Flaky full test suite (environmental, unrelated to the diff).** Run 1: 10,148 passed, one failure — `preview-request.test.ts` timing out under load; it passes in isolation (12/12 in 13 s). Run 2 (after stopping the QA server): 748 files failed at import level with a single environmental signature (`ENOENT` inside the runner's agent-run-tmp TMPDIR plus `posix_spawn 'git'` ENOENT), zero assertion failures. The machine was under memory pressure (12.2 of 13.3 GB swap used; `repoos stats` reported pressure "warning — advisory only"), a documented flake class. Per the engineer and `docs/debugging-check-failures.md`, the environmental failures were not chased; every touched test file passes repeatedly in isolation and the scoped `repoos check` was fully green (its test step ran on the remote validation runner).
- **Loading-skeleton race in the first QA measurement.** A fixed-wait measurement caught the 768 px Agents capture mid-load. Fixed properly by waiting for each state's own selector (`[data-testid=agents-empty-state]`, `.mobile-queue-empty`, `.ncpr`) with a timeout, which also fails loudly if a state never renders.
- **Two formatting lints** in new files, caught by the scoped check and fixed with `bun run fmt`; the re-run passed every step including the rendered contrast audit.

## Learnings

- **Empty states drift into alarm-colour at the element level.** #0592 fixed the Checks page's green-skipped-gate once, but the same state still carried red "failure" styling in two other places on the same screen. A colour-policy decision must be applied at the *state* level, not per element — and the test should pin the whole shape (reminder present, zero `.ck-err` lines), not one selector. Durable home: the UI conventions doc (`docs/agent-ui-and-preview-conventions.md`), which already carries the #0592 rule.
- **"No matching tasks" vs "No tasks yet" is the same lesson in words:** an empty filtered result and an empty project are different user moments with different next actions. Worth a line in the UI conventions doc so future empty-state copy checks both cases.
- **A QA pass that can't reach the state it's auditing quietly audits nothing.** The missing `checks:emptyPlan` fixture was the real blocker for the acceptance criteria; building the fixture first made every other check meaningful and left the state capturable for future reviews. General rule for future QA tasks: if the state under audit can only exist on a fresh repo, add a pinned preview fixture before measuring anything.
- **Wait for state selectors, not fixed sleeps, in layout-measurement scripts** — the older `measure-mobile-widths.mjs` pattern propagated the race until this task replaced it with per-state waits that also fail loudly.
- The memory-pressure flake class and "don't chase environmental failures" rule are already documented (`docs/debugging-check-failures.md`); this run is one more worked example of following it rather than a new rule.

## Follow-ups

None recorded. (Linked tasks: none. The reviewer left three non-blocking suggestions — a unit test pinning the reworded "No check steps resolved for this repo." line, replacing the positional `.ncpr-btn nth(1)` selector in `first-run-interactions.mjs` with a role/name query, and wiring up or trimming the dead-link-probe comment in `measure-first-run-widths.mjs` — which were not filed as tasks and remain open only as review-pass notes.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
