---
id: "0631"
title: Show enrichment-in-progress on inputs list cards
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/show-enrichment-in-progress-on-inputs-li
created_at: "2026-10-02T23:44:30Z"
updated_at: "2026-10-03T02:26:39Z"
handoff_signal_retry_count: 2
review_rounds: 2
review_passes: 2
---
## Problem

New inputs are created immediately with a raw first-line title while PM enrichment (AI-written title, type, and area) runs in the background (#0628). The New input panel already acknowledges in-flight creation with copy and an `ActivityIndicator` after submit (#0325), so users who stay on the panel see that work is happening.

If the user closes the panel (e.g. **Done**) and opens the Inputs list, the new capture appears right away with the raw title, which is correct. There is no indication on the list that enrichment is still running, so it looks finished even though the title (and possibly type/area chips) may update seconds later. That gap is confusing and inconsistent with the panel experience.

## Desired UX

On the Inputs list (and anywhere the same input card is shown in that flow), an input that exists on the server but has not yet received `input.enriched` should show a clear in-progress state—preferably the same `ActivityIndicator` animation used in the New input panel’s “Creating your input” acknowledgment.

While enrichment is pending, the card may still show the raw title (and existing chips). When enrichment completes, the card updates in place to the enriched title/type/area without requiring a manual refresh, matching today’s SSE behavior. When enrichment fails or returns nothing parseable, the in-progress state clears and the card stays on the raw title with no stuck spinner.

## Acceptance criteria

- [ ] After submitting a new input and closing the New input panel, the corresponding card on the Inputs list shows an in-progress indicator until background enrichment finishes or definitively fails
- [ ] The indicator reuses the same `ActivityIndicator` component (or identical styling/motion) as the New input panel acknowledgment state
- [ ] When `input.enriched` arrives, the indicator is removed and the card reflects the enriched fields without a full-page reload
- [ ] If enrichment fails or leaves the input unchanged, the indicator is removed and the card remains usable with the raw title
- [ ] Other inputs on the list are unaffected; only inputs actually awaiting enrichment show the state
- [ ] The in-progress treatment meets existing contrast and theme expectations (no new hard-coded colors outside established patterns)

## Notes for AI

- Background flow: `submitInput` / POST returns raw input; server enriches async; client learns completion via SSE `input.enriched` (`src/ui-app/src/stores/repo.ts`, `src/ui-app/src/types.ts`). Tests in `src/ui-app/tests/input-enrichment.test.ts`.
- List UI: `InputCard.vue` + `InputsView.vue`—likely need client-side tracking of “enrichment pending” per input id from submit until `input.enriched` (or a timeout/failure path if the store already exposes one).
- Reuse `ActivityIndicator.vue` from `NewInputPanel.vue` (`ff-done` / “Creating your input”) rather than inventing a second animation.
- Do not block opening the input or moving status while enrichment runs; this is affordance only.
- Rebuild UI after changes (`bun run build:ui` or full build). Consider a focused test or extending an existing input UI test if there is a lightweight way to assert pending → enriched UI state.
- Task #0631 in `work/` may carry screenshots of the gap; check attachments if helpful for placement on the card.

## Scope

Covers the inputs list card (and shared `InputCard` if used only in that context). Defer richer copy (“AI is writing title…”) unless needed for clarity; animation parity with the panel is the primary ask. Out of scope: changing enrichment logic, retries, or panel acknowledgment behavior.

## Related

- #0628 — background PM input enrichment
- #0325 — New input panel immediate acknowledgment
- Draft capture task #0631 (same user report, may include screenshots)

## Original prompt

Also when I create a new input and the AI is making the title I guess, when I close out and go to see the inputs list, the raw input is there which is good, but there's no indication that the AI is working on it, so we should add an animation there too (good if it's the same one that we see on the new input panel).

## Screenshots

![Screenshot-2026-10-02-at-20.02.33](/api/tasks/0631/attachments/screenshot-1.png)
![Screenshot-2026-10-02-at-20.02.17](/api/tasks/0631/attachments/screenshot-2.png)

## Shots
```json
[
  {
    "label": "Inputs list with enrichment-in-progress indicator on the freshly created card",
    "target": "default",
    "route": "/inputs",
    "highlight": ".input-list .ai",
    "steps": [
      {
        "click": ".new-btn"
      },
      {
        "fill": "#new-input-text",
        "text": "Inputs list should show the AI is still writing the title"
      },
      {
        "click": ".drawer-body .btn-row button"
      },
      {
        "waitMs": 300
      },
      {
        "click": ".ff-done .btn-row button:last-child"
      },
      {
        "waitMs": 400
      }
    ]
  }
]
```

## Activity

- 2026-10-02T23:44:30Z · created · hello@repoos.org
- 2026-10-02T23:44:31Z · screenshots
- 2026-10-02T23:44:31Z · screenshots
- 2026-10-02T23:44:55Z · status draft→inbox, title, area, body
- 2026-10-02T23:45:02Z · status inbox→ready
- 2026-10-02T23:45:11Z · status ready→active, branch
- 2026-10-03T00:36:31Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-03T00:50:52Z · body: section Shots
- 2026-10-03T00:55:56Z · status active→review
- 2026-10-03T00:56:02Z · note: shots: failed — capture of Inputs list with enrichment-in-progress indicator on the freshly created card on "default" failed: click: Error: strict mode violation: locator('.drawer-body .btn-row button') resolved to 2 elements:
- 2026-10-03T00:57:05Z · status review→active
- 2026-10-03T01:10:09Z · status active→review
- 2026-10-03T01:10:25Z · note: shots: failed — capture of Inputs list with enrichment-in-progress indicator on the freshly created card on "default" failed: click: Error: strict mode violation: locator('.drawer-body .btn-row button') resolved to 2 elements:
- 2026-10-03T01:11:13Z · status review→active
- 2026-10-03T02:26:39Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
