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
   showed nothing. It now gets the same `--ring` outline.
5. **Capture-phase Escape leak** (`CopyInspectorOverlay.vue`, review round 2).
   The overlay's window `keydown` listener runs in the capture phase, ahead of
   every bubble handler, so no layer behind it could consume an Escape first:
   with the copy-inspector popup open, one Esc closed the popup *and* the
   palette or task drawer behind it. The handler now consumes the Escape it
   acts on (`preventDefault` + `stopPropagation`) and leaves Escapes alone
   while no popup is open. Regression-tested with a window-listener spy, both
   directions.
6. **Nine more undeclared custom properties** (`style.css`, review round 2).
   The same silent-failure family as the dead focus rings, beyond `outline`:
   `--txt-muted`, `--txt-secondary`, `--txt-primary`, `--bg-secondary`,
   `--border-focus`, `--cyan-border-tint`, `--cyan-tint`, `--shadow-lg`,
   `--mono` and bare `var(--font-mono)` were referenced but defined nowhere,
   so affected text fell back to the inherited sans face, focus borders and
   shadows vanished. They are now aliased at `:root` to the real theme tokens
   (`--txt-muted`/`--txt-secondary`/`--txt-primary` to `--txt-dim`/`--txt`,
   `--bg-secondary` to `--panel`, `--border-focus` to `--border-bright`,
   `--font-mono`/`--mono` to the canonical JetBrains Mono stack, `--shadow-lg`
   defined per appearance, and the cyan washes derived per theme from `--cyan`
   via `color-mix`, so named themes track automatically). The test guard now
   covers *every* fallback-less `var()` in the stylesheet, resolving against
   declarations anywhere in `src/ui-app` (CSS or runtime style bindings) with
   a documented exception for Radix's own `--radix-*` popper variables.
7. **Modality documented** (review round 2). The confirm overlays (dirty
   close-out, hotfix, deploy — z-index 1000) and the chat queued popover
   (12000) intentionally sit above the palette: ⌘K under a confirmation stays
   hidden. The ladder comment in `style.css` and a new test pin that, so a
   future palette raise has to argue with the comment rather than drift.

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

`src/ui-app/tests/keyboard-shortcuts-qa.test.ts` (jsdom, 29 tests): the route
coverage table, ⌘K-with-focus-in-input, Esc consumption with a window listener
spy, the palette-over-drawer Esc sequence against the real board-nav composable,
the copy-inspector capture-phase Esc in both directions, the two-stage Esc, the
Tab trap, the z-index ladder including the documented modal modality, and the
stylesheet-wide undeclared-variable guard. `keyboard-shortcuts-qa-browser.test.ts`
(headless WebKit, fixtures): no-overflow audits and touch-target assertions at
375/768/1280, plus the close button's visible focus ring.

## Round-2 review follow-ups

Two items came back from review round 2; both are addressed with evidence.

**Dashboard shot captured under the loading veil.** The skeleton veil
(`PageSkeleton`) shows after 180 ms of loading and stays visible a minimum of
350 ms once shown (`SKELETON_MIN_VISIBLE_MS`, anti-flicker), so a capture
scheduled 300 ms after the click could land inside that window — the round-2
dashboard shot was recorded `missing-target` with `[aria-busy="true"]` still
up, and the round-2 `/work` capture hit the same veil before passing on retry.
Both declared shots now settle 900 ms after the palette opens, clearing the
worst-case veil lifetime; the shot *content* is unchanged.

**`--shadow-lg` on the light ui-theme variants.** The reviewer flagged the
dark value (0.45 alpha) as possibly leaking onto light ui-theme variants,
which don't redefine the token. Measured in WebKit across all seven ui-theme
variants in both dark and light modes: they don't. `--shadow-lg` is declared
exactly twice — `:root` (0.45) and `[data-theme="light"]` (0.16) — and the
two tie on specificity, with light winning by source order; the ui-theme
roots never declare it, so every light variant resolves to 0.16. The cascade
is now pinned by a 16-case table in `keyboard-shortcuts-qa-browser.test.ts`
(computed values in WebKit), so a future block reorder or a `--shadow-lg`
added to a ui-theme root cannot silently put the heavy dark shadow back on
light themes. No stylesheet change was needed.
