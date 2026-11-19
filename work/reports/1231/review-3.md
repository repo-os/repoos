---
task: "1231"
pass: 3
at: "2026-11-19T16:35:56.299Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-keyboard-shortcuts-and-command-p
state: ok
tree_identity: "b674c4603:7e2259ae86"
---
## Verdict
`good to go` — STALE-EVIDENCE-ONLY: handoff captures are for tree 7e2259ae8; HEAD (b674c4603) adds docs + one test only.

## Relevance
`still relevant` — the QA premise holds: shortcuts inventoried, Esc/z-index/focus-ring defects fixed with tests, and the committed QA doc matches the diff.

## Evidence
None

## Bugs

None found

No further findings of this class were found after grepping: `key === "Escape"` handlers across `src/ui-app/src` (SearchOverlay, CopyInspectorOverlay, useBoardKeyboardNav, HotfixConfirmDialog, DirtyCheckoutDialog, WorktreeHandoffConflictDialog, SendToEngineerDialog, DeploymentsView, DiffView, MobileTabs, ChatQueuedNotice, NoticeBell, TopBar, SidebarGitState, AreaPicker, SelectSearchGroup, SecretsView — the non-modal header/sidebar popovers intentionally keep their convenience Esc, and the palette's `stopPropagation` now shields them while it is open), fallback-less `var(--…)` references (no `--focus-ring` remains; all ten aliases declared at `:root`), `--shadow-lg` declarations (exactly two: `:root` 0.45, `[data-theme="light"]` 0.16; no ui-theme root declares it), z-index ladder users, `repoos.toml` (untouched, as required), and the added test/doc files for bare `node`/`npm`/`npx` (none; only `node:fs`/`node:path` imports).

Round-1 and round-2 findings verified fixed in the current tree: the capture-phase `CopyInspectorOverlay` Esc is guarded and consumed (pass-through when no popup, tested both directions), the palette consumes Esc with `stopPropagation`, `.search-overlay-backdrop` sits at z-index 160 with the ladder documented and test-pinned, and the dead focus rings now use `--ring`.

## Edge cases
- The round-2 report is stale (source commit 7e2259ae8 ≠ HEAD b674c4603), but the delta is `docs/qa` + one WebKit test — no UI source change — so its verified claims carry over.
- The new 16-case `--shadow-lg` cascade table correctly pins the subtle specificity fact it documents; if a ui-theme root ever declares the token, its higher specificity wins and the test fails as intended.
- Capture-timing: the 15:37 `missing-target` veil failure was a flake; the recorded handoff captures (16:13) show both shots clean with the palette legend and highlight ring.

## Suggestions
- Re-capture the two declared shots on the final tree so the evidence matches HEAD: `Command palette open over the dashboard` (`/`) and `Command palette open above the Work board` (`/work?shotState=board:withReviewTask`). Both currently render the declared state correctly; only the tree identity is stale.

## Verdict

`good to go` — STALE-EVIDENCE-ONLY: captures predate the final docs+test commit; code is sound.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T16:13:06.190Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

