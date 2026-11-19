## TL;DR

Task #1218 shipped an accessibility QA pass over the Settings, Agents and Releases pages. The only real code defect found was on the Agents page: its section switcher was a semantically flat row of buttons with no roving keyboard navigation, which was rebuilt as a labeled ARIA tablist with arrow/Home/End navigation, selected state and tab-panel relationships. Redundant native `title` tooltips were removed in favour of visible text and accessible names, the detected-agent binary selector and probing spinner gained accessible names/status, and a new dialog focus-trap/restoration regression test was added. One remote gate run failed on a test whose tooltip contract conflicted with the rendered-behavior test; the older source-level test was aligned and handoff succeeded on the second attempt. Review verdict: **good to go**, and the task closed out cleanly as `done` with a successful release.

## Outcome

The task's acceptance criteria were met:

- **Agents page** (`src/ui-app/src/views/AgentsView.vue`): the section buttons are now a semantic tablist (roles, `aria-selected`, roving tabindex, tab-panel bindings, `tabpanel` wrapper) with Arrow Left/Right, Home and End keyboard navigation that both activates and focuses the destination tab. Deep-link query-string behavior is unchanged.
- **Accessible naming**: the detected-agent binary selector's name now includes the agent and copy count; the visual-only probing spinner is announced as a status; duplicate native `title` attributes were removed from Agents and Settings (theme favorites, restart badge) where visible text or an aria label already covered them — the restart badge keeps visible text plus an accessible name with no native tooltip.
- **Settings and Releases**: reviewed, no interaction-model changes needed. Settings already had a named tablist with keyboard handling, explicit disclosure state, and Escape/focus restoration; Releases uses the shared Radix Vue dialog content with titles, descriptions and named close controls. The shared dialog primitive was kept as the single focus-management boundary.
- **Tests**: new regression tests for the Agents semantic tabs (`agents-view-cards.test.ts`) and shared dialog accessible name/description, focus containment and restoration (`dialog-focus-accessibility.test.ts`); `settings-restart-badge-layout.test.ts` updated to the agreed no-title contract.
- **QA document**: `docs/qa/2026-11-accessibility-qa.md` committed, recording scope, findings, changes and the verification boundary (headless rendered semantics only — no assistive-technology device session was claimed).
- Both declared shots (Agents semantic tab navigation, Settings keyboard navigation) were captured with a clean console: 2 of 2.

**Final verdict: good to go** (review pass 1), followed by a successful close-out with `release:success`.

## Process stats

- **Dev rounds:** 1 (Round 1). **Review rounds:** 1 (Pass 1, verdict good to go).
- **Wall-clock, created → done:** 2026-11-19T04:18:15Z → 05:25:15Z = 1h 07m 00s.
- **Agents and models:** all sessions ran under the `codex` harness on model `gpt-6-luna`. Engineer session: elapsed 2699s (~45m), 29,238,070 tokens. Reviewer session: elapsed 34s, 231,038 tokens. Two routing sessions (Model router via openrouter, model "unknown") took 0s and 1s.
- **Restarts/swaps:** one watchdog auto-resume of the engineer (`resume 1/3`) to read a deferred handoff message; no model swaps, no agent replacement.
- **Costs:** not recorded (session table shows `—` for cost on all rows).

## What went wrong

- **Handoff gate failure (remote validation, 05:06:48Z):** `tests/settings-restart-badge-layout.test.ts > places each restart hint before its control and keeps its accessible explanation` failed. Root cause was drifting test contracts: a source-level layout test expected a native `title` tooltip on the restart badge, while the rendered-behavior test asserted the opposite (visible text + aria label, no native title). **Resolution:** the older source-level test was aligned with the rendered behavior on the resumed turn; the next gate run passed.
- **Watchdog auto-resume (05:06:49Z):** after the failed handoff, the watchdog auto-resumed the engineer to deliver the queued fix message (1 message delivered at 05:06:51Z). Resolved without human intervention.
- **CTO nudges (04:57:51Z, 05:17:51Z):** two "held — handoff gate is running" nudges; informational only, no action needed.
- No crashes, stalls, flaky checks or review-cycle failures were recorded.

## Learnings

- **Source-level tests and rendered-behavior tests can drift on tooltip contracts.** When two tests assert opposite contracts for the same control, align on the rendered behavior the user actually experiences. The incident is task-local here, but the debugging principle (reproduce, compare the two expectations, don't theorise) is already covered in `docs/agent-debugging-and-incidents.md`; no new durable rule is proposed from this single occurrence.
- **A visually styled row of buttons is not a tablist.** Agents is now consistent with Settings' established tab pattern; future pages should reuse that pattern rather than rolling flat buttons into a switcher.
- **Native `title` is not an accessible name.** Removing redundant titles in favour of visible text + aria labels is the preferred contract for restart badges and similar hints in this UI.
- **The shared dialog primitive is an accessibility boundary:** views keep titles, descriptions and close labels; focus containment and restoration stay in the common wrapper. View-local focus code would duplicate it.
- The QA notes deliberately separate headless rendered semantics from a physical screen-reader session; that boundary belongs in future QA docs too (the committed `docs/qa/2026-11-accessibility-qa.md` records it for this pass).

## Follow-ups

None.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
