---
id: "0751"
title: "Easter eggs bundle: handoff shot summary and dev target ports"
type: chore
status: active
priority: p3
area: [web, ui]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-handoff-shot-summary-
created_at: "2026-10-09T20:07:36Z"
updated_at: "2026-10-10T06:23:54Z"
handoff_signal_retry_count: 1
---
## Problem

This is a bundle of two small, independent fixes. They don't depend on each other and can land in either order:

1. The UI verification block on the Changes tab is a raw log, so users can't tell at a glance whether each handoff screenshot shows what its caption claims.
2. Dev targets (#0747) have fixed ports, which can clash with other apps on the machine. Task previews already avoid this with a `{port}` placeholder.

## Desired UX

Item 1 (Changes tab):
- Each shot in the handoff UI verification block gets one line with a "matches" or "check" badge, its caption, and the thumbnail.
- "matches" means every declared step succeeded and the capture was taken.
- "check" names the failed step in plain words, for example "couldn't find the fullscreen toggle".
- Raw selector and timeout messages collapse under a single "details" toggle, hidden by default.
- The block header becomes one sentence, for example "2 shots, both captured, 2 need checking".

Item 2 (Dev page and dev targets):
- A dev target's command, url and healthCheck can contain `{port}`. RepoOS replaces it with a free port when the target starts, the same way `[[preview.targets]]` does.
- The Dev page shows the real URL of a running target, not the configured one.

## Acceptance criteria

Item 1:
- [ ] Each shot shows a "matches" or "check" badge derived from its step results.
- [ ] A failed step is shown in plain words, with the raw message available under "details".
- [ ] A shot with no failed steps shows "matches" and no warning text.
- [ ] The header summarises the count of matching and checking shots in one sentence.
- [ ] Tests cover a shot with all steps passing, one with a failed step, and one with no steps.

Item 2:
- [ ] A target whose command contains `{port}` starts on a port that is free at start time.
- [ ] `{port}` in the url and healthCheck is replaced with the same port the command uses.
- [ ] A target with no `{port}` behaves exactly as before, with no change to its fixed port.
- [ ] The Dev page shows the real URL of a running target.
- [ ] Tests cover a free-port substitution, a target with no placeholder, and a target whose url uses the substituted port.

## Items

1. Handoff shot verdicts on the Changes tab (source: the request after #0750). Area: web, ui. One-line fix: derive a per-shot verdict from the step results and render it in place of the raw log. Test: the three cases in item 1's acceptance criteria.
2. Dev targets: fill a free port with a `{port}` placeholder (source: the Dev page follow-up after #0747/#0748). Area: core, server, web. One-line fix: substitute `{port}` in the command, url and healthCheck with a free port chosen at start, and show the real URL on the Dev page. Test: the three cases in item 2's acceptance criteria.

## Notes for AI

- Item 1 is display-only. Do not change how shots are captured or how handoff gates work (#0743: missing targets are warnings, not failures).
- Item 2 changes the dev-target backend (#0747). Follow the existing `[[preview.targets]]` `{port}` handling rather than inventing a new one.
- Find the item 1 block by searching the Changes tab for "Handoff UI verification".
- Commit each item separately so a reviewer can read them apart.
- Use the shared badge and dialog components; no native title tooltips.
- Rebuild the UI with `bun run build:ui` after changes.

## Activity

- 2026-10-09T20:07:36Z · created · njachowski@gmail.com
- 2026-10-09T20:12:34Z · body: section Items
- 2026-10-09T20:12:38Z · title
- 2026-10-10T02:20:42Z · body
- 2026-10-10T05:59:05Z · status inbox→ready
- 2026-10-10T05:59:07Z · status ready→active, branch
- 2026-10-10T06:16:22Z · body
- 2026-10-10T06:17:38Z · body
- 2026-10-10T06:22:08Z · body
- 2026-10-10T06:23:54Z · body
