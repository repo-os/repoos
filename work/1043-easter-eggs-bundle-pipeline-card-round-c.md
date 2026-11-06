---
id: 1043
title: "Easter eggs bundle: pipeline card round chip and sent-back note"
type: chore
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Notes for AI"
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-06T12:18:04Z"
updated_at: "2026-11-06T12:18:05Z"
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

## Activity

- 2026-11-06T12:18:04Z · created · njachowski@gmail.com
- 2026-11-06T12:18:05Z · needs_input
