---
task: "1225"
pass: 1
at: "2026-11-19T14:46:32.452Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-toasts-banners-and-dialogs-stack
state: ok
tree_identity: "b35ce20ef:70f26ddf92"
---
## Verdict
`good to go` — QA harness and the drop-var fix are sound, tested at component level, and both handoff captures show the fix working.

## Relevance
`still relevant` — the transient surfaces still share the top-right corner and nothing on main has superseded this QA pass or its fixture.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: all `data-overlay-layer="floating"` components (TaskCard, AreaPicker, ReleaseUpdateNotification, StopWorkConfirmModal, HotfixConfirmDialog, CopyInspectorOverlay, SearchOverlay, WorktreeHandoffConflictDialog, MobileTabs, ChatJumpToLatest, SendToEngineerDialog, SidebarGitState, DirtyCheckoutDialog, ChatQueuedNotice, DeploymentsView), the `work-load-error`/`mobile-work-load-error` banners (both in-flow, not fixed), every `setToastPanelDrop`/`TOAST_PANEL_DROP_*` call site, NoticeBell's close paths (toggle, outside mousedown, Escape, follow, unmount), UiRecoveryBanner's watch/unmount/dismiss paths, ToastPanel consumers, and the fixture/test registrations in `shot-fixtures.ts` and `shot-preview-fixtures.test.ts`.

## Edge cases
- Tall notice popover at 375 px can clamp its bottom near the viewport edge, pushing some toasts below the fold until it closes — transient and self-correcting, and the QA scenario checks overlap/controls rather than full viewport fit here. Acceptable.
- `TOAST_PANEL_DEFAULT_TOP` in `uiRecovery.ts` duplicates the `calc(64px + var(--safe-top))` in `ToastPanel.vue`; a future topbar-height change must touch both. Maintainability only.
- Server landing preflight reports a conflict only in this task's own `work/1225-*.md` (main's copy wins at close-out); no source files conflict.
- The new `page-browser-gate.ts` preconnect benign-list bypass is anchored to the existing benign-URL list and pinned with both a benign and a non-benign test; non-benign hosts still record.

## Suggestions
None found

Both captures are current (tree `70f26ddf92`; only bookkeeping differs from reviewed HEAD), route-matched, non-blank: shot 1 shows the pinned five-toast stack with live × controls, shot 2 shows the popover open with the stack visibly dropped below it — the declared states render as labeled. Zero console errors recorded. `repoos.toml` untouched per the spec.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T14:43:57.174Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

