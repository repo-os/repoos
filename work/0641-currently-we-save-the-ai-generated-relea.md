---
id: "0641"
title: Surface unpushed AI release notes below generate button
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-10-04T02:00:15Z"
updated_at: "2026-10-04T02:20:12Z"
---
## Problem
When an AI release-notes generation succeeds but the subsequent release cut fails, the user has no visibility into whether those previously generated notes are available for reuse. The user just encountered this after a failed release (only updated `repoos.toml` and tried again on a remote runner). Without a quick reference, the user must guess whether to regenerate notes or reuse existing ones.

## Desired UX
Below the "Generate AI release notes" button, show a card displaying the most recently generated AI release notes that were never successfully pushed with a release. The card should show:
- How old the notes are (e.g., "generated 7 minutes ago")
- How far behind current `main` they are
- The actual release notes text
- Any other useful context to decide quickly whether to reuse them for a new release attempt

## Acceptance criteria
- [ ] A card is shown below the AI release notes generate button when unpushed generated notes exist.
- [ ] The card displays the notes' age ("generated x minutes ago").
- [ ] The card shows how far behind current `main` the notes are.
- [ ] The card renders the actual release notes text.
- [ ] The card conveys that these notes were not successfully pushed with a release.
- [ ] The card provides enough context for a user to quickly decide whether to reuse them for a retry.

## Notes for AI
- Only surface notes that were generated but never successfully released.
- Do not invent new storage mechanisms; use whatever persistence the AI release notes feature already uses.
- If it's ambiguous what "useful info" to include beyond age, distance from main, and text, default to showing the generation timestamp and main-commit distance.
- Area is `web` (UI surface change).

## Scope
Covers adding the info card to the release-notes generation UI. Deferred: changing how notes are stored, retry logic, or remote-runner behavior.

## Related
Release notes generation feature; release-cut failure and retry flow.

## Original prompt

Currently we save the AI generated release notes, but it's a black box to the user on whether or not the already-generated release notes get used again after a failed release like I just had. So Let's just surface a card below the AI release notes generate button which shows the most recently generated AI release notes that were not pushed successfully with a release already and say how old it is (generated x minutes ago), how far behind the current main it is etc (and the actual release notes text) and any other useful info the user may need to quickly decide if they can re-use those release notes to try to cut a new release again (usually it happens after a release cut failed for some reason and the user is just trying again after some minor fix, in my case I only updated the repoos.toml to try the release again on a remote runner)

## Screenshots

![Screenshot-2026-10-04-at-09.53.21](/api/tasks/0641/attachments/screenshot-1.png)

## Activity

- 2026-10-04T02:00:15Z · created · hello@repoos.org
- 2026-10-04T02:00:15Z · screenshots
- 2026-10-04T02:01:09Z · status draft→inbox, title, area, body
- 2026-10-04T02:20:10Z · review_cli_override
- 2026-10-04T02:20:12Z · review_model_override
