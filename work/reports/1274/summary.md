## TL;DR

Task 1274 was a QA sweep of the Agents settings tab (agent list, model providers, routing mode, status copy, key-missing and paused states) at 375, 768 and 1280 px. The existing headless WebKit QA harness already covered the key-missing states and 30 passing cases; the gap was the paused state (paused agent and paused model rows), which no browser case rendered. One engineering round added a table-driven case for the paused allowlist at all three widths, which exposed two real layout bugs in `BudgetControlsPanel.vue` (a fixed 188px corner reserve that clipped the paused chip at 375px, and a chip/button overlap at 768px). Both were fixed with a 212px reserve plus a below-720px layout change that drops row actions into normal flow. One review pass returned `good to go`, close-out succeeded, and the task released clean. No human step was needed.

## Outcome

The Agents settings page's Budget Controls (budget allowlist) panel now renders paused agent and paused model rows correctly at 375, 768 and 1280 px:

- A new deterministic, table-driven headless WebKit case renders a budget allowlist with two pauses (a whole-agent pause for `claude code` and a per-model pause for `opencode` / `deepseek v4`) and asserts, per width, that nothing overflows the viewport, the paused chip stays inside its row card, and no chip overlaps a row button.
- `BudgetControlsPanel.vue` changes: the paused chip may now wrap (dropping `nowrap`/ellipsis) so the resume date stays readable; the pinned-button reserve was raised from 188px to 212px to clear the Resume button at 768px; and below the app's 720px breakpoint row actions drop under the header in normal flow instead of a fixed reserve, since a 212px reserve left a 63px text column at 375px.
- The key-missing states ("Not set", "Saved", "Couldn't check", masked key field) were already covered by the earlier #1223 harness and copy verified correct; no changes were needed there.
- Two pre-existing items were deliberately left unchanged and documented instead: the native `title` tooltip on the ModelProvidersPanel "As of" span (asserted on purpose by the #0625 unit test) and shared-button focus-ring contrast.

Final verdict: review pass 1 returned `good to go` (evidence-gap-only: the handoff capture showed an unrelated route, with layout instead proven by the new WebKit cases); close-out gate passed and the task finished `done` with `release:success`.

## Process stats

- Timeline: created 2026-11-20T07:26:57Z, done 2026-11-20T13:07:20Z — about 5 hours 40 minutes from start to done.
- Engineering rounds: 1 of 1 (no restarts). Engineer: agent `claude code` on `haiku`, 668s elapsed, 36,165 tokens, $0.27606353000000006.
- Review rounds: 1 of 1. Reviewer: `opencode` agent on `opencode-go/glm-5.3-flash`, 117s elapsed, 45,107 tokens, $0.02228682.
- Other recorded sessions: a `routing` model-router session (model unknown, 0s) and a `debugger` session on `opencode-go/deepseek-v4.1-flash` at 12:43:05Z (7s, tokens/cost not recorded) — both `finished`; their purpose is not recorded beyond the role labels.
- Token total across costed sessions: 81,272. Cost total: $0.29835035 (engineer + reviewer).
- Close-out gate: completed in 540s at 13:04:52Z.
- Branch `feat/qa-pass-agents-page-model-providers-and-`, merged commit `bde8a1882645d5d578d1f152ef00dc5a9b9379d4`.

## What went wrong

- **Handoff gate hold:** a CTO nudge at 07:40:42Z recorded the task as held because the handoff gate was running; it cleared normally and review was requested at 07:41:43Z. No action was needed.
- **Queued message never delivered:** a message queued at 07:41:44Z (at review request) sat undelivered, was flagged `message_overdue` at 08:54:36Z, and was finally discarded at 13:05:02Z with the note that the task was done. Nothing in the record shows what the message was; it was dropped, not delivered.
- **Long review→close-out gap:** the review verdict landed at 07:43:41Z but the close-out gate only completed at 13:04:52Z (~4h20m later). The record gives no reason for the delay; the close-out gate itself ran in 540s.
- **QA test file failed to load on first run:** Vitest picked the root config, which has no Vue plugin, so every `.vue` import failed. Resolved by running the UI suite with `--config src/ui-app/vite.config.ts` — a known repo convention (`bun run test` already does this), not a regression.
- **New test failed on first run at 375px and 768px:** this was the test doing its job — it exposed the two layout bugs above. Two intermediate fixes (chip wrapping alone; reserve to 212px alone) each fixed only one width; the mobile breakpoint change was what made 375px pass.
- No flaky checks, crashes, failed gates or restarts were recorded.

## Learnings

- **A fixed padding reserve for absolutely pinned buttons breaks at every width except the one it was tuned for.** Wrapping or resizing the number can't save a column that narrow (the first attempt produced a 39px-wide chip); below a breakpoint the layout itself must change. Worth folding into `docs/agent-ui-and-preview-conventions.md` as a named anti-pattern.
- **jsdom budget tests passed throughout because they don't measure geometry** — the overlap and card-edge checks only fail in a real layout engine. Reinforces the existing convention that UI layout claims need the headless WebKit harness, not component unit tests alone.
- **The QA fixture harness needed one extension:** `snapshotPanel` now accepts extra stubs so a component whose child fetches data renders without a network call. Documented in the round record; worth noting in the conventions doc alongside the existing harness description.
- **No `state` fixture existed for a paused budget allowlist**, so no meaningful `## Shots` entry could be declared and the single auto capture showed an unrelated route. The reviewer suggested a `budget-allowlist-paused` fixture — a natural small follow-up for the shot-fixture work documented in `docs/agent-ui-and-preview-conventions.md`.

## Follow-ups

None. No tasks were filed from this task (Linked tasks: none recorded). Two reviewer suggestions were left as unfiled recommendations for whoever drives the board next: (1) add a `budget-allowlist-paused` state fixture so shots of this tab are meaningful, and (2) replace the native `title` on the ModelProvidersPanel "As of" span with a styled popover per AGENTS.md (blocked on rewriting the #0625 test assertion), plus the shared-button focus-ring contrast pass — all candidates for an Easter-eggs bundle rather than one-off tasks.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
