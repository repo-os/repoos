---
task: "1269"
pass: 2
at: "2026-11-20T06:03:55.046Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-command-palette-and-global-keybo
state: ok
tree_identity: "c6f24eee0:c6f24eee09"
---
## Verdict
needs some work — one focus-restore branch can still silently drop focus; the rest of round 1's findings are genuinely fixed.

## Relevance
still relevant — palette a11y/focus/wording QA is not superseded by anything on main; the diff matches the task.

## Evidence
None

## Bugs
- **Class: detached focus-restore target** — `SearchOverlay.vue` `closeOverlay()` (~line 310): the round-2 fix guards the *remembered* focus with `isConnected`, but the caller-supplied branch is `props.returnFocusEl ?? …` with no `isConnected` check. ContextView and SettingsView pass their trigger (`contextSearchBtn` / `settingsSearchBtn`), and in `openResult` the `router.push` starts before the `setTimeout(0)` focus fires; for context-scope doc and skill results the push leaves the `repo` route, unmounting ContextView and its trigger, so `el.focus()` no-ops and focus drops to body — exactly the regression the `restoreFocus` flag was meant to prevent. Fix: apply the same `isConnected → rememberedFocus()` fallback to `props.returnFocusEl`. Settings-scope results stay within SettingsView, and the header scope survives navigation, so those paths are fine.

No further findings of this class were found after grepping: SearchOverlay.vue (all `closeOverlay` call sites: Escape, backdrop, ✕, `openResult`), SearchBar.vue, SettingsView.vue, ContextView.vue callers, MobileWorkQueue/AgentModelModal search inputs, both test files.

Round-1 findings verified fixed: empty/truncated copy is out of the listbox in a persistent `role="status"` region; the `aria-expanded` dispute is resolved coherently (listbox now rendered only when `displayItems.length`, so expanded/controls match what exists — the engineer's combobox rationale is sound); the load-race seq counter works as tested; the `restoreFocus` flag is correct in intent.

## Edge cases
- Load-race other branch: if the *newer* body load finishes while an older one is still pending, the seq check clears `loadingBodies` early — "No results" can flash if the older fetch covers a path the newer set dropped.
- Task-result path (`restoreFocus=false`): if `ui.openTask` fails, no drawer opens and focus is on body.
- `lastFocused` can be `body` (⌘K with no focus); restoring to body is harmless but the `.search-input` fallback never engages.

## Suggestions
- The two read-only `docs/qa/*` records still carry the stale "context-free empty copy" line; needs a human unlock or follow-up task.
- The declared shot cannot pin 375px (schema has no viewport field); the three-width WebKit fixtures are the width evidence — acceptable.

## Could not verify (environment)
None — mergeability from the server checklist (only this task's bookkeeping file conflicts, resolved from main).

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T06:01:51.959Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

