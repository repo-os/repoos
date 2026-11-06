---
id: 1043
title: "Easter eggs bundle: pipeline card round chip and sent-back note"
type: chore
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-pipeline-card-round-c
cli_override: codex
model_override: gpt-6-luna
review_cli_override: claude code
review_model_override: haiku
created_at: "2026-11-06T12:18:04Z"
updated_at: "2026-11-06T16:45:48Z"
---
## Problem

On the Work Queue pipeline card the bottom row shows separate chips `E14` and `R3 changes`, and the stage row adds a `sent back ×2` note. The sent-back count duplicates the reviewer chip (every send back is a review pass that asked for changes), the word "changes" does not fit on the card, and the card says `E` where the task drawer says `D`.

## Desired UX

- Remove the `sent back ×N` / `sent back once` note from the pipeline lanes (`PipelineView.vue` sentBackNote and its span).
- Replace the separate engineer and reviewer chips with one pill in the same style as the task drawer's `.rounds-badge`: `D14 · R3` (D = dev passes, R = review passes). Keep the tone (amber when the last review asked for changes, green when passed, red on repeat failure) as colour on the pill, and drop the words "changes", and keep the ✓ and ↻ marks only if they fit.
- Share the formatting with the drawer through `taskRoundCounts` / `pipeline-card.ts` so the two cannot drift.

## Acceptance criteria

- No `sent back` text on any pipeline card.
- Card shows `D<n> · R<m>` in the drawer badge style; `reviewerChip` tests updated.
- Review-running state still shows the upcoming round (`R<m+1> …`) without overflowing.

## Notes for AI
Files: `src/ui-app/src/components/PipelineView.vue` (sentBackNote, lane chips, engineerRound/reviewerChipText), `src/ui-app/src/lib/pipeline-card.ts` (taskRoundCounts, reviewerChip), the card component that renders the chips, and the drawer's `.rounds-badge` in `TaskDrawer.vue`. Reuse the existing `.rounds-badge` styling rather than adding bespoke scoped CSS. Update the pipeline-card unit tests. Declare one shot of the Work Queue pipeline view showing a card with an amber round pill.

## Shots
```json
[
{
"label": "Pipeline card with amber D/R round badge",
"target": "default",
"route": "/work?shotState=board:pipeline",
"highlight": ".rounds-badge",
"state": "board:pipeline"
}
]
```

## Activity

- 2026-11-06T12:18:04Z · created · njachowski@gmail.com
- 2026-11-06T12:18:05Z · needs_input
- 2026-11-06T12:18:12Z · needs_input, body: Notes for AI (added)
- 2026-11-06T15:30:21Z · status inbox→ready
- 2026-11-06T15:52:29Z · cli_override
- 2026-11-06T15:52:49Z · model_override
- 2026-11-06T15:53:15Z · review_cli_override
- 2026-11-06T15:53:20Z · review_cli_override
- 2026-11-06T15:53:22Z · review_model_override
- 2026-11-06T15:53:24Z · status ready→active, branch
- 2026-11-06T15:56:21Z · body
- 2026-11-06T15:59:04Z · body
- 2026-11-06T16:02:49Z · body
- 2026-11-06T16:09:01Z · CTO nudge: held — handoff gate is running
- 2026-11-06T16:20:47Z · CTO nudge: held — handoff gate is running
- 2026-11-06T16:45:48Z · message_queued at 2026-11-06T16:45:48.796Z
- 2026-11-06T16:45:48Z · handoff failed · handoff recovery attempted · finalization failed
