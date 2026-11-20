---
task: "1269"
pass: 1
at: "2026-11-20T05:49:05.605Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-command-palette-and-global-keybo
state: ok
tree_identity: "38821f0bd:74c416e0b8"
---
## Verdict
needs some work — two screen-reader defects remain in the palette listbox wiring the change just touched.

## Relevance
still relevant — focus restore, ARIA combobox wiring and empty-state wording were real gaps; nothing on main supersedes them.

## Evidence
None

## Bugs
- **Class: invalid listbox children** — `SearchOverlay.vue` (template, ~line 525): the engineer fixed group wrappers citing "a bare div inside a listbox is not a valid child," but two siblings of that exact class remain: the `.search-empty` empty-message div and the `.search-truncated` notice sit as direct children of `role="listbox"`, which permits only `option`/`group` descendants. Both should live outside the listbox (or the empty state become `role="status"`).
- **Class: ARIA combobox state wiring** — `SearchOverlay.vue` (~line 449): `:aria-expanded="displayItems.length > 0"` announces "collapsed" while the listbox is rendered and visible (e.g. empty state showing "No results for …", which lives inside the `aria-controls` target). Per the combobox pattern, `aria-expanded` reflects whether the popup is displayed — it always is while the overlay is open — so it should bind to `props.open`.

No further findings of this class were found after grepping: SearchOverlay.vue template (listbox/group/legend wiring), SearchBar.vue, SettingsView.vue, ContextView.vue callers, keyboard-shortcuts-qa.test.ts, keyboard-shortcuts-qa-browser.test.ts, command-palette-a11y-qa.test.ts, docs/qa records.

## Edge cases
- Overlapping `loadSearchBodies` calls (open watcher plus `docList` change mid-flight) can clear `loadingBodies` in the first `finally` while the second load is still pending, briefly showing "No results" during an active load.
- `lastFocused` can be a detached element by dismiss time (caller unmounted while open); `focus()` then no-ops and focus drops to body.
- `closeOverlay(null)` on result-open intentionally drops focus for task results (drawer takes it), but doc/skill/setting results navigate without any element taking focus — focus lands on body.

## Suggestions
- Wrap the empty/loading/truncated messages in a polite live region so state changes are announced (the engineer already deferred this; the empty-state fix above is the natural place).
- The two read-only `docs/qa/*` records now have one stale line about "context-free" empty copy; they need a human unlock or follow-up, as the engineer noted.
- The single auto capture (route `/`) shows the home page and search pill, not the palette itself; no shots were declared, and the three-width palette evidence is the WebKit fixture suite, which is acceptable — but a declared palette shot at 375px would make this visible to the human.

## Could not verify (environment)
None — all findings come from the diff and code; mergeability comes from the server checklist (only this task's own bookkeeping file conflicts, resolved from main).

## Verdict
needs some work — fix the two listbox ARIA defects above before sign-off.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T05:46:17.564Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

