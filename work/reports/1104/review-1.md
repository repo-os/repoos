---
task: "1104"
pass: 1
at: "2026-11-14T03:55:49.376Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/restart-notice-unsupervised-servers-get-
state: ok
tree_identity: "b2ed7726d:7a234e1a6"
---
## Verdict
`needs some work` — dismiss via Escape/overlay does not persist, and polling can reopen the restart dialog without visible content.

## Relevance
`still relevant` — The restart-notice UX and release-bump gating problems are real, and this branch addresses them in the right place.

## Evidence
None

Handoff capture shows the shared `am-modal` restart dialog (supervised actions, overlay, dimmed board) on `/?shotState=release:restartPendingLight`; console recorded zero errors. Unsupervised copy-button UX is test-covered only, not in the shot.

## Bugs
- **Class: dialog-dismiss persistence** — `ReleaseUpdateNotification.vue`: only the close button’s `@click` calls `dismissRestartNotice`; Escape and outside-click close via Radix without writing `RESTART_DISMISSED_KEY`, so the notice can return while `restartPending` stays true.
- **Class: dialog-open/content desync** — same file: `watch(restartStatus)` and the mount path force `restartOpen = true` whenever `restartPending` (including every 3s poll), without checking dismissal or `restartNoticeVisible`, so after a stored dismiss the dialog can sit `open` with `v-if="restartNoticeVisible"` false.

No further findings of this class were found after grepping: `ReleaseUpdateNotification.vue` (dismiss handlers, `restartOpen`, `watch(restartStatus)`, both `Dialog` shells).

## Edge cases
Publication gating via `latestVersion === installedVersion` plus `release/run.state !== "running"` matches server contracts; failed `release/run` fetch suppresses conservatively. Upgrade and restart dialogs share one `copied`/`copiedTimer` state (unlikely overlap).

## Suggestions
Wire `@update:open` to persist dismiss when closing, and only auto-open when the full visibility predicate is true. Optional unsupervised fixture shot for human review.

## Could not verify (environment)
Main has uncommitted `repoos.toml` per landing checklist (close-out blocker only, not this code).

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-14T03:54:43.803Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

