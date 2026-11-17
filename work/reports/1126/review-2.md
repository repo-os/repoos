---
task: "1126"
pass: 2
at: "2026-11-17T05:16:43.294Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/releases-generate-ai-notes-and-publish-l
state: ok
tree_identity: "e5a9a1b70:e5a9a1b70"
---
## Verdict
`needs some work` — the two new release-failure bell kinds are dropped by the attention-event store's read allowlist, so they vanish after a restart.

## Relevance
`still relevant` — the two-wait babysitting problem is unsolved on main; this adds the chooser, the durable server-owned promise and guarded reuse of the Publish path.

## Evidence
None — both declared captures render correctly (modal showing v0.6.1 with both answers; "Will publish v0.6.1 when the notes are ready" banner with Cancel), routes matched, console clean. But they are stale: recorded on `b99575e54`, reviewed HEAD is `e5a9a1b70`; re-capture on the final tree before sign-off.

## Bugs
- **Class: attention-kind registration (persistence allowlist)** — `src/server/attention-events.ts` `isRecordedEvent()` still enumerates only the pre-existing recorded kinds. `releaseNotesFailed` and `releaseAutoPublishFailed` (`src/server/attention-notify.ts:133,154`) are written to `attention-events.json` and surface in-process, but `load()` filters them out on the next read, so after a server restart the bell/Needs-you record of why the draft or auto-publish failed disappears. The pass-1 fix covered both UI registries (`stores/notices.ts`, `stores/notifications.ts`) and the `AttentionKind`/`RecordedAttentionEvent` unions, but not this runtime allowlist; `attention-kind-registries.test.ts` only checks the UI sets. Both new kinds are affected; sibling recorded kinds (`releaseEmailFailed`, etc.) still round-trip.

No further findings of this class were found after grepping: `src/core/attention.ts` (union, SEVERITY, RecordedAttentionEvent, feed links), `src/server/attention-notify.ts`, `src/server/attention-events.ts`, `src/server/attention-feed.ts`, `src/ui-app/src/stores/notices.ts`, `src/ui-app/src/stores/notifications.ts`, `src/server/notifications/{spec,dispatch,ntfy-provider,telegram-provider,types}.ts`, `docs/releases.md`, `user-docs/deployments-and-releases.md`.

## Edge cases
- Engineering report is stale: source `b99575e5` vs reviewed HEAD `e5a9a1b70` (four later WIP commits changed `ReleasesView.vue` and routes); there is no current-round report, so its rationale is not evidence.
- The remembered default is deferred until the promise is terminal; closing the tab before the draft settles loses the preference (the promise itself is server-owned).
- If `collectReleaseCommits` throws after the record is created, the record stays `waiting` with no draft until Cancel or restart, and manual Publish is blocked meanwhile.
- `autoPublishChecks` says "New commits landed" when the current context has no relevant commits (`currentKey === null`) — a misleading reason.

## Suggestions
- Make the recorded-kind allowlist table-driven (one exported set) so a new attention kind cannot be half-registered, and add a store round-trip test (record → recreate store → list).
- Re-capture the two declared shots on `e5a9a1b7`; their states are unchanged in the final UI, but the evidence predates it.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T05:10:04.713Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

