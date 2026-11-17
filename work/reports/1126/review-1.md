---
task: "1126"
pass: 1
at: "2026-11-17T03:47:47.752Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/releases-generate-ai-notes-and-publish-l
state: ok
tree_identity: "6e826b1a4:b99575e54"
---
## Verdict
`needs some work` — the new attention kinds are never registered in the UI, so a failed draft or blocked auto-publish produces no in-app notification at all.

## Relevance
`still relevant` — the two-wait babysitting problem is unsolved on main; this branch adds the chooser, durable promise and guarded reuse of the Publish path.

## Evidence
None — both declared captures render correctly (modal with v0.6.1 and both answers; "Will publish v0.6.1…" banner with Cancel), routes matched, console clean; captures are from `b99575e54` and only bookkeeping changed to HEAD.

## Bugs
- **Class: attention-kind registration** — `src/core/attention.ts` adds `releaseNotesFailed`/`releaseAutoPublishFailed` (union, severity, event kind, link) and `src/server/attention-notify.ts` records both, but neither the UI kind registry (`src/ui-app/src/stores/notices.ts`: `NoticeKind`, `NOTICE_KIND_LABELS`, `NOTICE_KIND_COLOR`, `ATTENTION_NOTICE_KINDS`) nor the channel registry (`src/ui-app/src/stores/notifications.ts`: `NotificationType`, `NOTIFICATION_TYPES`, labels, descriptions) was extended. `ingestAttentionItem` returns `null` for an unlisted kind and `notify()` short-circuits, so a failed draft, an empty draft or any pre-cut blocker (dirty tree, tag exists, newer commits, release running) reaches no bell item, no Needs-you row, no sound/push — only ntfy/Telegram and the Releases banner. Unconfigured channels means the human is not told why until they open the page. Applies to both new kinds; the cut-failure path is covered only incidentally by the derived `releaseFailed`.

No further findings of this class were found after grepping: `src/core/attention.ts`, `src/server/attention-notify.ts`, `src/server/routes/attention.ts`, `src/ui-app/src/stores/notices.ts`, `src/ui-app/src/stores/notifications.ts`, `NeedsYouPanel.vue`, `notifications.test.ts`, `docs/`.

## Edge cases
- Auto-publish (`ready`/`waiting` record) is killed by RepoOS's own PATCH: the first "remember my choice" write adds `release.notesWhenReady` to `repoos.toml`, making the tree dirty, so the very first automatic publish always fails "working tree was dirty".
- `maybeAutoPublish` has no try/catch; a throw from `getReleaseStatus`/`collectReleaseCommits` propagates into `draftNotes`' catch, marking a successful draft failed and leaving the record `ready`.
- `resumeReleaseAutoPublish` at boot lacks the `isPreviewChild` guard every other background job has.
- Release notification links use the captured request origin, not `webUiLink`, so `REPOOS_PUBLIC_URL`/tunnel setups get a localhost link.

## Suggestions
- Skip the config PATCH when the choice equals the saved default (stop churning `repoos.toml` on every Generate).
- Make `autoPublishHeadline` mode-aware: a failed `notify` request currently reads "vX was not published automatically".
- Add a story/test asserting every `AttentionKind` is present in the UI registries.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T03:37:23.652Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

