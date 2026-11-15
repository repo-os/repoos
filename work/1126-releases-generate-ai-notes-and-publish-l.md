---
id: "1126"
title: "Releases: 'Generate AI notes and publish' - let the user choose auto-publish or notify-me when the AI draft is ready"
type: feature
status: inbox
priority: p2
area: [web, server]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-15T08:14:22Z"
updated_at: "2026-11-15T08:14:29Z"
---
## Problem

Cutting a release today takes two waits: click Generate AI release notes, wait a few minutes for the draft (a server-tracked run, #0605), then come back and click Publish. Nick often forgets to come back, which wastes time. A human should not have to babysit the draft just to press Publish.

## Desired UX

In the Releases page 'cut a release' panel:

- Clicking **Generate AI release notes** opens a small modal (shared dialog components, not a native confirm) asking what should happen when the draft is ready:
1. **Publish automatically** - as soon as the notes are ready, publish the release with the generated notes and known issues.
2. **Notify me** - when ready, send a notification (in-app plus the existing notification channels) so the user can review the notes and click Publish themselves.
- Also add a single **Generate notes and publish** button that goes straight to option 1 (after a confirm that shows the version and tag that will be cut).
- The choice is remembered as a default, with a way to change it in the panel or Settings (a Settings control is required for any repoos.toml setting).

## Acceptance criteria

- [ ] The modal appears when Generate AI release notes is clicked and offers 'Publish automatically' and 'Notify me', in the shared dialog, keyboard and touch usable, with the version/tag shown.
- [ ] With auto-publish chosen, a finished draft publishes through the same guarded release path as the Publish button (same blockers, version/tag confirmation, clean-main and checks), and the Releases page shows 'Will publish when the notes are ready' with a Cancel that stops it before publishing.
- [ ] If the draft fails, comes back empty, or any release blocker appears (dirty main, tag exists, newer commits since the run started, checks failing), nothing is published and the user is notified why; a failed auto-publish never retries silently.
- [ ] With notify chosen, a notification arrives when the draft is ready, linking to the Releases page with the notes filled in and Publish enabled.
- [ ] The pending choice survives a page reload and a server restart (server-owned, like the draft run), and only one auto-publish can be pending at a time.
- [ ] Never publishes anything the user did not opt into for that exact version; closing the modal without choosing does nothing. Tests cover both choices, cancel, a failed draft, a blocker appearing mid-wait, and restart persistence.
- [ ] Docs (user-docs release page) and any CLI parity (a flag such as repoos release --generate-notes --publish-when-ready, or a reasoned exemption in src/cli/api-route-parity.ts) are updated.

## Notes for AI

Reuse the existing AI-draft run in ReleasesView.vue and the server release run; do not add a second release path. Auto-publish is an outward-facing action, so it must go through every check the manual Publish does and must be cancellable. Follow AGENTS.md UI conventions (shared dialogs, Teleport, no native confirm).

## Activity

- 2026-11-15T08:14:22Z · created · t@t
- 2026-11-15T08:14:23Z · needs_input
- 2026-11-15T08:14:28Z · body: Desired UX (added); Desired behavior (removed)
- 2026-11-15T08:14:29Z · needs_input
