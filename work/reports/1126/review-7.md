---
task: "1126"
pass: 7
at: "2026-11-17T10:30:02.740Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/releases-generate-ai-notes-and-publish-l
state: ok
tree_identity: "3d2e30f2e:e5a9a1b70"
---
## Verdict
`good to go` — **STALE-EVIDENCE-ONLY**: both captures are from `e5a9a1b70`; only notify-mode copy changed since. Re-capture on HEAD.

## Relevance
`still relevant` — the two-wait release flow is still on main; this adds the chooser, the durable server-owned promise and a guarded reuse of Publish.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `writeAutoPublishState`, `failAutoPublish`/`failPendingOnDraftError`, `settleAutoPublishAfterDraft`, `maybeAutoPublish`/`autoPublishChecks`, `settleAutoPublishAfterCut`, `cancelReleaseAutoPublish`, `resumeReleaseAutoPublish`, `runRelease`/`beginRelease`/`startAutoReleaseCut`, the `release-auto-publish` store read/write/remember paths, every `autoPublish` template branch in `ReleasesView.vue`, attention-kind registration (`core/attention.ts`, `attention-events.ts`, `stores/notices.ts`, `stores/notifications.ts`, ntfy/telegram/spec/dispatch), `release.notesWhenReady` registration (parser, `getConfigSchema`, `SUPPORTED_TOML_KEYS`, types, settings-location, docs, tests), API-route parity, and the shot fixtures.

## Edge cases
- Engineering report is stale (source `b99575e5`; HEAD `3d2e30f2e`) with no current-round report — its rationale is not evidence for this tree.
- `?drawer=cut` is read only in `onMounted`: clicking the bell/Needs-you item while already on `/releases` changes the query but does not open the panel (one extra click).
- A Cancel racing the cut start gets a 409, but the next 1s poll clears the message, so the "already publishing" reason only flashes.
- A terminal `notified` record still pre-fills `newVersion` whenever the panel opens with an empty field.
- Notify chosen before any suggested version exists yields an empty tag in the banner/notification copy.
- A `repoos.toml`-only dirty tree fails auto-publish, though manual Publish checkpoints safe churn (stricter, fails closed).

## Suggestions (non-blocking)
- Re-capture both declared shots on `3d2e30f2e`; content should be unchanged (both are publish-mode, and only notify-mode copy moved).
- ntfy bodies carry no link while `user-docs/deployments-and-releases.md` says the channels link back — add a `Click` URL or scope the sentence to Telegram/in-app.
- Make the cancel hint mode-aware ("Automatic publish cancelled" also shows for a notify promise) and drop the unused `autoPublishTag` computed.
- Keep the 409 Cancel reason on screen instead of letting the poll wipe it.

Notes verified as fixed: pass-6 mode-blind copy (headline/page/panel branches + test), pass-4 `publishing` overwrite guards, pass-2 recorded-kind allowlist, pass-1 UI kind registries.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T05:10:04.713Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

