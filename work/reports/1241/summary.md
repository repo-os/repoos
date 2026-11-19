---
id: summary
title: summary
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: ""
---
## TL;DR

Task 1241 was a QA pass over the Agents page's Build Your Team, Scheduled Tasks and Reminders sections with long lists and long names, verified headlessly at 375, 768 and 1280 px. The engineer extended the existing `agents-page-qa-browser.test.ts` with long-list cases mounting the real panels against fixtures (55–60 entries each), added real form-validation cases, and fixed one real bug the pass found: a long unbroken schedule name overflowed its card because the title's flex container lacked `min-width: 0` and the title had no `overflow-wrap`. The fix landed in `ScheduledTasksPanel.vue` with a new `expectInsideCards` assertion that was proven to fail on the unfixed code. The QA record is `docs/qa/2026-11-agents-long-lists-qa.md`. Review passed in a single round ("good to go") and the task closed successfully on 2026-11-19.

## Outcome

Shipped:

- **One real bug fix** in `src/ui-app/src/components/ScheduledTasksPanel.vue` (+8/−0): `min-width: 0` on the schedule title's flex container plus `overflow-wrap` on the title, so unbroken 96-character schedule names wrap inside their card instead of running past the border at 375 and 768 px.
- **~350 lines of new QA coverage** in `src/ui-app/tests/agents-page-qa-browser.test.ts`: three long-list cases (60 schedules, 60 reminders, 55 custom agents) mounting the real panels against Pinia stores with `fetch` stubbed and item-count assertions; two form-validation cases (invalid schedule timezone, cleared reminder date) asserting plain-English messages and editor fit at three widths; and a new `expectInsideCards` helper that checks inner text against each card's border — catching overflow the viewport audit missed.
- **QA document** committed at `docs/qa/2026-11-agents-long-lists-qa.md`, as required by the acceptance criteria.

Final verdict: review pass 1 returned **"good to go"** (evidence-gap-only); the close-out gate completed successfully and the task status moved to done with `release:success`.

Not shipped / documented gaps: built-in team cards remain stubbed (`BuiltInAgentCard`), persistence against the real backend was not exercised, and no human device check occurred.

## Process stats

- **Engineering rounds:** 1 (round 1, completed 2026-11-19T19:41:19Z, agent "claude code", model haiku).
- **Review passes:** 1 (pass 1, 2026-11-19T19:43:12Z, verdict "good to go").
- **Wall-clock created → done:** 19:07:09Z → 20:21:27Z on 2026-11-19 = 1 h 14 min 18 s.
- **Agents and models per role:**
- Engineer: agent `engineer`, model `haiku`, elapsed 1844 s, 146 tokens, cost 0.28857936999999995 (as recorded), finished.
- Reviewer: agent `reviewer`, model `opencode-go/glm-5.3-flash`, elapsed 111 s, 41915 tokens, cost 0.01692328, finished.
- Routing: model router (jev), model unknown, 0 s elapsed, no tokens/cost recorded, finished.
- **Restarts or model swaps:** none recorded.
- **Close-out gate:** completed in 375 s.
- **Automated verification:** browser console-error check passed (handoff evidence, 2026-11-19T19:41:14Z); guard negative-test evidence skipped — no check guard rules were materially changed on the branch.
- **Merged commit:** 3d8b6d4b6cf968d41adeb5a55ff75434899da742.

## What went wrong

- **A real layout bug found by the QA pass itself:** a long unbroken schedule name ran past its card at 375 and 768 px. The viewport-edge audit did not flag it because the text stayed on screen — it only left its card. It was spotted by inspecting the 375 px screenshot. Fixed via the CSS change, and guarded by the new `expectInsideCards` assertion (verified to fail with 12 overflowing names per width when the `overflow-wrap` rule was deliberately removed, then pass after restoration).
- **Vitest config miss:** the first test run failed to parse `.vue` files because the default Vitest config does not load the Vue plugin. Resolved by running through the UI config (`src/ui-app/vite.config.ts` via `bun run test:vitest`).
- **macOS shell incompatibility:** `head -n -1` is unsupported on macOS; worked around by splicing the file with `sed '$d'`.
- **Wrong first tool for the layout check:** `scopedCss` was tried on `AgentsView` and `AgentCard`, but neither has a `<style>` block; the correct path was the global stylesheet, and the case passes empty CSS like the existing agent-list case.
- **CTO nudge during the run:** at 19:29:09Z a nudge recorded that the task was held because the handoff gate was running; it cleared and handoff succeeded at 19:41:19Z. No further action was needed.
- **Review evidence gap (non-blocking):** the only attached capture showed the dashboard rather than the touched Agents page. The reviewer accepted the geometric assertion (confirmed failing pre-fix) plus the QA-doc-recorded screenshot review as sufficient; a re-capture on `/agents` was deemed optional.
- No crashes, stalls, failed handoffs, or flaky checks were recorded beyond the above.

## Learnings

- **A viewport-edge audit is not enough for long text.** Text can stay on screen and still run past its card's border; containment must be checked inner-text-against-container, not only element-against-viewport. This is now embodied in the reusable `expectInsideCards` helper and is worth carrying into `docs/agent-ui-and-preview-conventions.md` so future QA passes reach for it by default.
- **Confirm a new assertion fails on the unfixed code before trusting it** — the mutation check (removing the CSS rule and observing 12 failures per width) is what made the green run trustworthy.
- **Stubbing a whole child panel with `true` hides exactly the layout long lists break.** The earlier QA pass (#1223) stubbed `ScheduledTasksPanel`, `RemindersPanel` and `BuiltInAgentCard`, so those panels had never been rendered with real data. QA passes should mount real components with fixture data and assert item counts. Candidate for the same conventions doc.
- **Screenshots still catch what geometry assertions miss.** The overflow bug was only obvious in the rendered image; both checks belong in the QA toolkit.
- **Known sharp edges worth a note in `docs/`:** `scopedCss` compiles only the first `<style>` block per component (silently drops CSS if a second block is ever added), and `expectInsideCards` checks horizontal containment only — safe while cards auto-size vertically, a hazard if fixed-height cards appear.
- Testing-environment gotchas (Vitest needs the UI config for `.vue` files; macOS `head -n -1` limitation) are project-wide facts; if not already recorded in `docs/agent-debugging-and-incidents.md`, they belong there.

## Follow-ups

None recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
