---
task: "1231"
pass: 1
at: "2026-11-19T15:14:57.744Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-keyboard-shortcuts-and-command-p
state: ok
tree_identity: "44a4fda56:5a78f306df"
---
## Verdict
`needs some work` — one remaining sibling instance of the Esc-consumption class the diff fixes (capture-phase window handler).

## Relevance
`still relevant` — the QA premise holds: the fixes match the acceptance criteria and the committed QA doc is accurate.

## Evidence
None

## Bugs
- **Class: escape-consumption-leak** — `src/ui-app/src/components/CopyInspectorOverlay.vue` registers its window `keydown` in **capture** phase, so it fires *before* the palette's `@keydown` and `stopPropagation` cannot reach it. With a copy-inspector popup open and the palette (or a task drawer) open behind it, one Esc closes both layers: the capture handler calls `closePopup()` without `preventDefault`/`stopPropagation` on the Escape branch, then the drawer's window handler (and the palette, via its own element handler) also fires. This is the same leak the diff fixes for bubble-phase handlers and for `SearchOverlay`; the palette-over-drawer scenario is reachable (⌘K opens the palette while the popup is up). Fix in the same style as the diff: guard + consume (`preventDefault` + `stopPropagation`) the Escape the popup handles.

No further findings of this class were found after grepping: window/document Escape keydown handlers (`useBoardKeyboardNav`, `HotfixConfirmDialog`, `DirtyCheckoutDialog`, `WorktreeHandoffConflictDialog`, `SendToEngineerDialog`, `DeploymentsView`, `DiffView`, `MobileTabs`, `ChatQueuedNotice`, `NoticeBell`, `TopBar`, `SidebarGitState`, `StopWorkConfirmModal`, `AreaPicker`), capture-phase listeners in `src/ui-app/src`, `--focus-ring` and `outline: … var(--…)` in `style.css` and scoped styles, z-index declarations in `style.css`, `repoos.toml` (untouched, as required), and package.json/justfile/shebangs/spawn sites for bare `node`/`npm`/`npx` (none introduced).

## Edge cases
- The new outline-variable guard only scans `outline` declarations. Other undefined custom properties exist in `style.css` (pre-existing, verified defined nowhere in `src/ui-app`): `--txt-muted`, `--txt-secondary`, `--bg-secondary`, `--border-focus`, `--cyan-border-tint`, `--cyan-tint`, `--shadow-lg`, `--mono`, plus bare `var(--font-mono)` uses (other call sites use the `, monospace` fallback). Same silent-failure family; widening the guard to all declarations would catch them.
- Confirm overlays sit at z-index 1000 and `chat-queued-pop` at 12000, above the palette's 160: ⌘K while a confirm modal is open mounts the palette beneath it, invisible. Defensible modality, but undocumented in the new ladder comment/test.

## Suggestions
- The declared shot shows the palette open over the board but can't visually demonstrate Esc consumption or stacking-over-drawer; the jsdom tests cover both, so this is fine — consider a drawer-open state fixture if a re-capture ever happens.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T15:11:22.763Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

