---
task: "1126"
pass: 6
at: "2026-11-17T08:39:34.222Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/releases-generate-ai-notes-and-publish-l
state: ok
tree_identity: "36c1b700f:e5a9a1b70"
---
## Verdict
`needs some work` — a notify-mode draft shows "Will publish vX when the notes are ready" for the whole draft; wrong promise copy.

## Relevance
`still relevant` — the two-wait release flow is still on main; this adds the chooser, durable server-owned promise and guarded reuse of Publish.

## Evidence
None

## Bugs
- **Class: mode-blind pending UI** — `src/ui-app/src/views/ReleasesView.vue` renders every `waiting`/`ready` record as an automatic publish regardless of `record.mode`. A **notify** choice is created as `waiting` and only settles to `notified` when the draft lands (1–3 minutes), so all of this is false on the page:
  - `autoPublishHeadline` (line 220): "Will publish {tag} when the notes are ready" — the acceptance wording for publish mode, shown to a user who chose Notify.
  - Page banner (lines 1544–1547): "the release is published only after the draft lands and every Publish check passes".
  - Drawer banner (lines 1935–1938): "Cancel stops the automatic publish, not the draft" — there is no automatic publish to stop.

  This tells the human an outward action is pending that they never opted into (and that the server will never perform). It is untested: `release-when-ready.test.ts` "Notify me…" stubs a notes response with no `autoPublish`, whereas the real `POST /api/release/notes` returns the `waiting` notify record, so the banner does render. Fix by branching copy on `mode` (e.g. "Drafting — you'll be notified when {tag} notes are ready") and add a test mounting a `{state:"waiting",mode:"notify"}` record.

No further findings of this class were found after grepping: `autoPublishHeadline`, both banner templates, `autoPublishActive`, `settleAutoPublishAfterDraft`/`failAutoPublish` kind selection, `cancelReleaseAutoPublish`, `resumeReleaseAutoPublish`, `beginRelease`/`startAutoReleaseCut`, `releaseNotification*`/spec/telegram/ntfy messages, and the release-when-ready and release-auto-publish tests.

## Edge cases
- Engineering report is stale (source `b99575e5`; reviewed tree `fa7881cbf`, later fix `36c1b700f`), and no pass-5 report exists — its rationale is not evidence for this tree.
- A `repoos.toml`-only dirty tree fails auto-publish, though manual Publish checkpoints safe churn (stricter, fails closed).
- ntfy bodies carry no link; only the in-app item and Telegram link to `/releases?drawer=cut`.
- A 409 from Cancel is cleared by the next 1s `applyAutoPublish`, so the "already being published" reason flashes.
- An old terminal `notified` record pre-fills `newVersion` on every later panel open.

## Suggestions
- Re-capture both declared shots on `fa7881cbf`: evidence is tree `e5a9a1b70`; both PNGs are correct (chooser with v0.6.1 and both answers; "Will publish v0.6.1…" banner with Cancel, clean console), and only server/test files changed since.
- Add a click/URL action to ntfy release notifications.
- Remove the unused `autoPublishTag` computed (line 216).

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T05:10:04.713Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

