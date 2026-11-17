---
task: "1126"
pass: 4
at: "2026-11-17T07:11:54.645Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/releases-generate-ai-notes-and-publish-l
state: ok
tree_identity: "42bd835eb:e5a9a1b70"
---
## Verdict

`needs some work` — a record can be re-settled while it is `publishing`, so a live automatic cut is reported as “not published”.

## Relevance

`still relevant` — the two-wait release flow is still on main; this adds the chooser, durable promise and guarded reuse of Publish.

## Evidence

None

## Bugs

- **Class: publish-state regression (writes over `publishing`)** — `src/server/routes/release.ts` `settleAutoPublishAfterDraft()` only rejects non-active records, so a record in `publishing` is rewritten to `ready`, then `maybeAutoPublish()` sees `run.state === "running"` and fails it (“A release was already running, so nothing was published automatically”) with a failure notification — while the cut is actually running. On completion `settleAutoPublishAfterCut()` requires `publishing`, so it no-ops: the release ships but the page/notification say it did not. Reachable from the cached-draft branch: reload during the automatic cut, open the cut panel, and `fillSavedNotes()`’s `cachedOnly` POST hits the notes cache and calls settle again (second tab same). Guard: settle only from `waiting`.
- **Class: publish-state regression (sibling)** — `failAutoPublish()` (via `failPendingOnDraftError`, empty-draft and `draftNotes` failure paths) also treats `publishing` as active and would overwrite a live cut with `failed`; `writeAutoPublishState()` has no transition guard at all. Same rule: nothing except `settleAutoPublishAfterCut` may write over `publishing`.

No further findings of this class were found after grepping: `settleAutoPublishAfterDraft`, `maybeAutoPublish`/`autoPublishChecks`, `failAutoPublish`, `failPendingOnDraftError`, `settleAutoPublishAfterCut`, `cancelReleaseAutoPublish`, `resumeReleaseAutoPublish`, `runRelease`, `release-auto-publish.ts` store writers, and the new tests.

## Edge cases

- Engineering report is stale (source `b99575e5`, no current-round report); treated as no evidence.
- `?drawer=cut` is read only in `onMounted`: clicking the in-app bell/Needs-you item while already on `/releases` does not open the drawer (WorkView watches `route.query.task` for the equivalent). Recoverable with one extra click.
- A `repoos.toml`-only dirty tree fails auto-publish, though manual Publish checkpoints that churn via `checkpointSafeChurn`.
- A notify choice made before the deferred config write lands is lost if the tab closes first (fallback stays `notify`).

## Suggestions

- Add a test that a cached-hit settle is a no-op while `publishing`.
- Re-capture both declared shots: evidence is `e5a9a1b70`, reviewed HEAD `71fe18a2d` (only server/test files changed since, and both captures show v0.6.1 modal/banner correctly with a clean console).
- ntfy bodies carry no link; only Telegram does, so docs’ “linking back” is Telegram-only.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T05:10:04.713Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

