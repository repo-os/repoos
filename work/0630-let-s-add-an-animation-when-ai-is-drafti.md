---
handoff_signal_retry_count: 2
id: "0630"
title: Polish AI release-notes drafting feedback and panel-return state
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/polish-ai-release-notes-drafting-feedbac
created_at: "2026-10-02T23:43:04Z"
updated_at: "2026-10-03T02:11:32Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-03T01:32:28.816Z: server-side finalization timed out (deadline exceeded)"
review_rounds: 2
review_passes: 2
---
## Problem

When **Generate with AI** is drafting release notes for a cut, the UI does not use the same animated “AI is working” treatment as task **coding** and **reviewing** flows. Drafting is mostly static copy (“Drafting…”) without the familiar activity indicator, so it feels disconnected from other agent work in the product.

The cut-release panel also tells users they can close the panel and come back while generation runs. In practice, after closing and returning, the form can look like a fresh empty state: the version field may appear blank, and there is no clear signal that notes are still being drafted or that a draft finished and is ready to use. That contradicts the on-panel guidance and makes people think progress was lost.

## Desired UX

While the server-tracked release-notes draft is **running**, show an **ActivityIndicator** (or equivalent) consistent with **coding** / **reviewing** — animated dots plus an accessible status label (e.g. “Drafting release notes…”). Keep or refine the existing helper text about being able to close the panel, but only if behavior actually matches.

When the user **closes the cut-release panel** (or leaves and returns to Releases) during or after a draft:

- **Version** they were preparing for the cut remains visible (including values chosen via **Cut Next** or typed semver), not an unexplained empty field.
- If drafting is **still in progress**, reopening shows the same in-progress state: drafting animation, disabled generate/publish as today, and copy that generation is ongoing.
- If drafting **finished while away**, reopening shows that the draft is **ready** (notes in the field or a clear hint to generate/reuse, consistent with existing cached-draft behavior) — not a silent empty form with no explanation.

The experience should match what the async-hint already promises: close, come back, and pick up where the draft left off.

## Acceptance criteria

- [ ] While `GET /api/release/notes/run` reports `state: "running"`, the release-notes section shows the shared **ActivityIndicator** (or the same visual pattern as task drawer coding/reviewing), with `role="status"` / `aria-live` appropriate for screen readers.
- [ ] Closing the cut-release panel with a draft **in flight**, then reopening it on the same Releases visit, still shows **Drafting…** (or equivalent) and continues polling until the run completes or fails.
- [ ] After closing the panel during a draft, the **new version** field is **not blanked** when the user had entered a version or used **Cut Next** before closing (unless a successful publish cleared it per existing rules).
- [ ] If the draft **completes** while the panel is closed (same browser session or after navigating away from Releases and back), reopening shows the **completed draft or an explicit ready/reuse hint** — not an empty notes field with no indication anything finished.
- [ ] If the draft **failed** while the panel was closed, reopening surfaces the **error** on the notes field (not a silent reset).
- [ ] Existing tests for tracked release-notes runs (`release-cut-next.test.ts`, #0605) still pass; add or extend coverage for panel-close/reopen and version persistence if gaps exist.
- [ ] On-panel copy about closing during generate remains accurate; adjust wording if behavior changes.

## Notes for AI

- Primary surface: `src/ui-app/src/views/ReleasesView.vue` (`.rel-notes-drafting`, `generatingNotes`, `syncNotesRunAtOpen`, `applyNotesRun`, `VERSION_STORAGE_KEY` / #0621).
- Reuse `src/ui-app/src/components/ActivityIndicator.vue` as in `TaskDrawer.vue` (`variant="working"` / `reviewing` — pick whichever matches product tone for drafting).
- Server tracking already exists (#0605): `GET /api/release/notes/run`, poll on mount. User report suggests **reopen / leave-page** paths still drop visible state (version, in-progress, or terminal draft). Trace `observedNotesKey` / `placedNotesKey` / `fillSavedNotes` — a succeeded run the session never “owned” may intentionally not backfill; reconcile that with the promised “come back” UX (e.g. sync on open from run endpoint and/or `cachedOnly` POST without clobbering user typing).
- Do **not** change release cut/publish pipeline semantics or add runtime dependencies.
- Rebuild UI after changes (`bun run build:ui` or full build). Run scoped `repoos check --changed main` before handoff.

## Scope

**In scope:** Release cut drawer AI notes drafting UX — animation, panel close/reopen, and returning to the Releases page while a draft runs or after it finishes.

**Out of scope:** Changing the release-notes agent prompt, server draft quality, or unrelated Releases page layout.

## Related

- #0605 — server-tracked AI release-notes draft run and poll-on-reopen
- #0621 — version field persistence across reload (localStorage)
- #0590 — cached notes reuse on generate

## Original prompt

Let's add an animation when AI is drafting the release notes, it can be similar to the animation when AI is coding or reviewing. Also it said I can close the panel and go away while it generates, but when I came back it seemed like everything had reset...e.g. the version number was blanked and there was no indication that it was still drafting the release notes or that it was ready.

## Screenshots

![Screenshot-2026-10-02-at-20.00.14](/api/tasks/0630/attachments/screenshot-1.png)

## Shots
```json
[
  {
    "label": "Cut-release drawer — AI notes drafting row now leads with the shared ActivityIndicator while a draft runs",
    "target": "default",
    "route": "/releases?drawer=cut"
  }
]
```

## Activity

- 2026-10-02T23:43:04Z · created · hello@repoos.org
- 2026-10-02T23:43:05Z · screenshots
- 2026-10-02T23:44:10Z · status draft→inbox, title, area, body
- 2026-10-02T23:44:47Z · status inbox→ready
- 2026-10-02T23:44:48Z · status ready→active, branch
- 2026-10-03T00:36:31Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-03T00:51:09Z · body: section Shots
- 2026-10-03T00:56:53Z · status active→review
- 2026-10-03T00:58:13Z · status review→active
- 2026-10-03T01:07:12Z · status active→review
- 2026-10-03T01:08:41Z · status review→active
- 2026-10-03T02:11:32Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity

