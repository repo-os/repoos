---
id: "0751"
title: "Easter eggs bundle: handoff shot summary and dev target ports"
type: chore
status: inbox
priority: p3
area: [web, ui]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-09T20:07:36Z"
updated_at: "2026-10-09T20:12:38Z"
---
## Problem

The UI verification block on the Changes tab is a raw log. Users can't tell at a glance whether each handoff screenshot shows what its caption claims. The useful answer is one verdict per shot.

## Desired UX

- Each shot in the handoff UI verification block gets one line with a "matches" or "check" badge, its caption, and the thumbnail.
- A "matches" badge means every declared step succeeded and the capture was taken.
- A "check" badge names the failed step in plain words, for example "couldn't find the fullscreen toggle".
- Raw selector and timeout messages collapse under a single "details" toggle, hidden by default.
- The block header becomes one sentence, for example "2 shots, both captured, 2 need checking".

## Acceptance criteria

- [ ] Each shot shows a matches or check badge derived from its step results.
- [ ] A failed step is shown in plain words, with the raw message available under "details".
- [ ] A shot with no failed steps shows "matches" and no warning text.
- [ ] The header summarises the count of matching and checking shots in one sentence.
- [ ] Tests cover a shot with all steps passing, one with a failed step, and one with no steps.

## Items
1. Handoff shot verdicts on the Changes tab (source: the request after #0750). One-line fix: derive a per-shot verdict from step results and render it in place of the raw log. Test: the three cases in the acceptance criteria.
2. Dev targets: fill a free port with a `{port}` placeholder, the way `[[preview.targets]]` does (source: the Dev page follow-up after #0747/#0748). One-line fix: substitute `{port}` in a dev target's command, url and healthCheck with a free port chosen at start, and show the real URL on the Dev page. Test: a target with `{port}` starts on a port that is free at start, and its url and healthCheck match.


## Notes for AI

- Display-only change. Do not change how shots are captured or how handoff gates work (#0743: missing targets are warnings, not failures).
- Find the block by searching the Changes tab for "Handoff UI verification".
- Use the shared badge and dialog components; no native title tooltips.
- Rebuild the UI with `bun run build:ui` after changes.

## Activity

- 2026-10-09T20:07:36Z · created · njachowski@gmail.com
- 2026-10-09T20:12:34Z · body: section Items
- 2026-10-09T20:12:38Z · title
