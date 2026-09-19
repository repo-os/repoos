---
id: "0441"
title: Add new release available notification
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: ""
review_model_override: openrouter/tencent/hy4-preview
created_at: "2026-09-19T07:27:58Z"
updated_at: "2026-09-19T07:29:51Z"
---
## Problem
Users have no in-app notification when a new stable release of RepoOS is available, requiring manual checking or external discovery to find upgrades.

## Desired UX
When a new stable release is detected:
1. An unobtrusive, dismissable notification banner appears in the UI
2. Clicking the banner opens a modal displaying:
   - Current installed version
   - New available version
   - "Upgrade" and "Not now" buttons
   - Release notes (ideally)

## Acceptance criteria
- [ ] Detect new stable releases only (exclude pre-release tags: beta, canary, rc)
- [ ] Display dismissable notification when new release is available
- [ ] Clicking notification opens modal with version information
- [ ] Modal displays current installed version and new available version
- [ ] Modal has "Upgrade" button linking to upgrade instructions or release page
- [ ] Modal has "Not now" button to dismiss
- [ ] Release notes display in modal if available

## Notes for AI
- Fetch releases from GitHub API, filtering to exclude `prerelease: true` tags
- Current version location: verify in `src/core/config.ts` or `package.json`
- Notification style should be unobtrusive—consider a top banner or subtle toast pattern
- Release notes: fetch from GitHub release body; graceful fallback if unavailable
- "Upgrade" button behavior (link to releases page vs. in-app guide): final UX to be designed
- Session-based detection only initially—do not persist dismissed state across restarts
- Use existing UI components and design system for visual consistency

## Scope
Covers: detecting stable releases, dismissable in-app notification, upgrade modal with current/new version info and optional release notes.

Deferred: persistent "don't show again" across sessions, scheduled update checking, auto-update mechanism, manual "Check for updates" in settings.

## Original prompt

I'd like to make a small unobtrusive dismissable message show to the user when there's a new release of RepoOS available (i.e. when I cut a new stable release (not beta, canary or rc) so the user knows they can upgrade, and clicking on this message  should show their current version and the new version as a modal with options to "upgrade" or "not now", also ideally show the release notes in that modal.

## Activity

- 2026-09-19T07:27:58Z · created · hello@repoos.org
- 2026-09-19T07:28:37Z · status draft→inbox, title, area, body
- 2026-09-19T07:29:49Z · review_model_override
- 2026-09-19T07:29:51Z · status inbox→ready
