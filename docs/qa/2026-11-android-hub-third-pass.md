# Android Hub app screen QA — third pass

Task #1192. Headless Chromium QA of the Hub app's Vite shell at portrait and
rotated phone dimensions. This records browser evidence only; no physical
Android device or Android WebView was used.

## Setup and coverage

- Started the requested `bunx vite --port 5188` from `mobile/` on
  `127.0.0.1:5188` and used headless Playwright Chromium.
- Ran `bun scripts/fixture-qa.ts` from `mobile/`.
- Tested 360 × 800 and 412 × 915 portrait, plus their rotated dimensions of
  800 × 360 and 915 × 412 landscape.
- Swept all eight design themes (Classic, Clear, Gen Z, Jelly, Gruvbox,
  Catppuccin, Solarized and Hypercolor) in System, Light and Dark appearance.
  Checked the document's selected theme, resolved appearance, color scheme and
  non-transparent page background after each change.
- Exercised the seven existing fixtures (many servers, one server, empty,
  unreachable, settings, add and discovery), lock settings and lock retry, long
  server name and URL, edit sheet, add form error, unbroken discovery text and
  dev-update note wrapping.
- Checked element bounds against the viewport, row/menu bounds for the long
  server name, wrapping widths for long text and browser console/page errors.

## Result

**302/302 checks passed.** All four viewport dimensions passed fixture bounds
and console checks. The theme/appearance matrix passed at every dimension. The
long server name's row and overflow menu stayed within their card at all four
dimensions. Edit-sheet long URLs wrapped and stayed on-screen at all four
dimensions; the add-form error also remained within bounds. The unbroken URL,
discovery reason/message/warning and injected dev-update note fit their boxes.
Lock enabled controls and failed/successful retry states remained usable and
within viewport bounds, including landscape.

No layout defect was reproduced, so this pass changes the reusable QA script
and adds this evidence record; it does not change app styling. The expanded
matrix is retained in `mobile/scripts/fixture-qa.ts` for repeatable future
checks.

## Limits

- This was desktop Chromium emulating viewport dimensions, not device hardware,
  Android WebView, system bars, cutouts or keyboard behavior.
- `system` appearance resolves according to the emulated browser's color-scheme
  preference; it was verified to resolve to a valid Light/Dark theme and keep
  the document color scheme in sync.
- Discovery and server rows are deterministic fixtures; no live tailnet,
  reachability or update-manifest network behavior was tested.
- Screenshots were not retained. The run's assertions were geometric and
  computed-style checks.
