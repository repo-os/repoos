# Web app keyboard shortcuts and command palette QA — November 2026

## Scope

A conflict, discoverability and small-screen pass over every keyboard shortcut the
web UI ships, plus the ⌘K command palette. Headless Playwright (WebKit) against
fixture markup rendered from the real components; no visible browser was opened.
Task #1231.

## Shortcut inventory

| Where | Keys | Behavior | Listed for users |
| --- | --- | --- | --- |
| Every page (top bar) | ⌘K / Ctrl+K | Opens the command palette (SearchBar) | ⌘K chip in the pill |
| Repo page | ⌘K / Ctrl+K | Opens the context-scoped palette (docs + skills) | ⌘K chip in the page's search pill |
| Settings page | ⌘K / Ctrl+K | Opens the settings-scoped palette (name or config key) | ⌘K chip in the page's search pill |
| Command palette | ↑ ↓ | Move the highlight | Palette footer legend |
| Command palette | Enter | Open the highlighted result | Palette footer legend |
| Command palette | Esc | Close the palette | Palette footer legend |
| Command palette | Tab / Shift+Tab | Trapped inside the dialog | — (expected behavior) |
| Work board (opt-in) | j k / arrows, h l, Shift+j/k | Move the highlight; columns with h/l | Settings → General → Keyboard navigation |
| Work board (opt-in) | Enter | Open the highlighted task | Settings row |
| Work board (opt-in) | Esc | Two-stage: close the task panel, then clear the highlight | Settings row |
| Settings | ← → Home End | Roving tab selection | Standard tablist behavior |
| Composer fields | Enter / Shift+Enter | Send / newline (CTO, debugger, playground, review replies), IME-safe | Placeholder hints |
| Forms | ⌘/Ctrl+Enter | Commit (dirty panel, commit dialog, human-task dialog) | — |
| Radix drawer | Esc | Close; while fullscreen, Esc first leaves fullscreen | — |
| Mobile bar | Search tab | Opens the palette (no keyboard needed) | Labelled "Search" |

Touch devices: the ⌘K chips and the palette's keyboard legend are hidden
(`hover: none` / `pointer: coarse`, and ≤760px for the header chip); the pill
collapses to a 44×44 icon button at phone width (#1139, #1152 — already in
place, regression-tested in `mobile-touch-affordances.test.ts`).

## Findings and fixes

1. **Escape leaked out of the palette** (`SearchOverlay.vue`). While the
   palette was open, Esc closed it *and* still reached every window/document
   Escape handler behind it: on Work with a task drawer open, one Esc closed
   the palette and the drawer; the same keypress also dismissed the hotfix
   confirm, the deployments confirm, the diff-view back navigation and the
   mobile "More" sheet. The palette now consumes Esc completely
   (`stopPropagation`), matching the pattern the AreaPicker popover already
   used; the next Esc reaches the layer beneath, which is exactly the
   two-stage behavior the board nav documents. The radix-vue drawer already
   honored `defaultPrevented`, but the composable's window listener did not —
   now the event never gets there.
2. **Palette stacked at a tie with drawers** (`style.css`). `.search-overlay-backdrop`
   and `.drawer-wrap` both declared z-index 100, so ⌘K opened *under* an
   already-open drawer depending on teleport order. The palette now sits at
   160 — above drawers (100), chat jump-to-latest (130) and the screenshot
   viewer (140/150), below the tooltip (200) and card agent preview (300).
3. **Dead focus-ring variable** (`style.css`). Three `:focus-visible` rules
   used `outline: 2px solid var(--focus-ring)` — a custom property that is
   defined nowhere, so the declaration is invalid at computed-value time and
   paints nothing: `.review-history-latest`, `.review-history-row` and
   `.report-time summary` had no visible keyboard focus indicator. They now use
   the real `--ring` token.
4. **Close button had no focus indicator** (`style.css`). Inside the palette,
   the input shows a ring on focus but the close button — a focus-trap stop —
   showed nothing. It now gets the same `--ring` outline, and a table-driven
   guard in `keyboard-shortcuts-qa.test.ts` fails if any outline declaration
   references an undefined custom property again.

## Verified-good (no change needed)

- ⌘K works on every main route; `repo`/`settings` correctly delegate to their
  scoped palettes (route table pinned in tests).
- ⌘K opens the palette while focus is inside a text field — no editable guard
  wrongly swallows it.
- Board navigation never hijacks typing: j/k/h/l and arrows are inert while
  focus is in an input, textarea or contenteditable, and Enter/Space stay with
  a focused button or link.
- The palette's Tab trap, arrow navigation, Enter-open and Esc-close all work
  (already covered by `search-overlay-context.test.ts`; extended here).
- Small screens: the open palette fits with no horizontal overflow at 375, 768
  and 1280 px (WebKit audit over real component markup), the legend renders,
  the close button is 44px at phone width, and the pill is a 44×44 icon button.

## Noted, deliberately not changed

- The chip reads ⌘K on all platforms; Windows/Linux users press Ctrl+K, which
  works. Copy now shows a platform-specific label only in `user-docs`.
- macOS WebKit (and Safari) skip buttons when tabbing unless Full Keyboard
  Access is enabled — that is platform behavior, not an app defect; the
  palette's own Tab trap is asserted against the real component in jsdom.

## Verification

`src/ui-app/tests/keyboard-shortcuts-qa.test.ts` (jsdom, 26 tests): the route
coverage table, ⌘K-with-focus-in-input, Esc consumption with a window listener
spy, the palette-over-drawer Esc sequence against the real board-nav composable,
the two-stage Esc, the Tab trap, the z-index ladder and the outline-variable
guard. `keyboard-shortcuts-qa-browser.test.ts` (headless WebKit, fixtures):
no-overflow audits and touch-target assertions at 375/768/1280, plus the close
button's visible focus ring.
