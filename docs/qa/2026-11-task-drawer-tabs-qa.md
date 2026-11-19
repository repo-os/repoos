# Task drawer tabs: long content QA (November 2026)

## Scope and method

Headless-WebKit-only pass (#1221): the task drawer was driven at 375, 768 and
1280 CSS px by `src/ui-app/tests/task-drawer-long-content-browser.test.ts`. No
headed browser was opened and no focus was stolen.

Unlike the repo's CSS-only WebKit fixtures, the test drives the **production
drawer**: a harness page (`tests/fixtures/drawer-long-content-harness/`) is
built by the same Vite pipeline as the app (root `src/ui-app`, so Tailwind
source detection matches the production build), and it mounts the real
`TaskDrawer.vue` with the real pinia stores and stylesheet. Only the transport
is stubbed — `window.fetch` answers fixture payloads for the endpoints the
drawer loads, so every byte the drawer renders flows through the same
fetch → store → component path as production. Task opening happens after
mount, exactly as the app does it, so the drawer's own watcher initializes the
edit draft.

Fixture content is oversized on every long-content surface: a multi-thousand
character spec body, a 6-file diff whose code lines are ~200 unbroken
characters, 24 captured preview shots, a 66-paragraph review report, a
120-entry agent transcript and a 120-entry task log. The browser test imports
the same fixture module the harness serves, so the assertions can never drift
from the rendered content.

## What is exercised

- **Tab wiring:** all seven named tabs (Task, PM, Dev, Review, Changes, Tokens,
  Debug) are clicked through the production tab strip; the phone strip is the
  narrow scrollable variant (`drawer-tabs-scroll`), and every tab remains
  reachable by scrolling it. A dead or clipped tab control fails the test by
  timeout.
- **Task tab:** the long spec card renders through the production markdown
  path and scrolls to its end inside the drawer body.
- **Dev tab:** the 120-entry transcript renders inside the production
  `.agent-log` scroll container, which scrolls to its end.
- **Review tab:** the long report renders through the production markdown
  path inside the `.review-report-pane` scroll container, which scrolls to its
  end.
- **Changes tab:** both subtabs work; the UI pane renders 24 shot rows whose
  end is reachable, the last shot's real control opens the production
  `ScreenshotViewer` (24 prints inside), and the viewer's own close control
  dismisses it; the code pane renders 6 diff sections whose unbroken 200-char
  lines scroll horizontally **inside** the diff `<pre>` while the document
  never grows wider than the viewport.
- **Debug tab:** the 120-entry log feed renders and scrolls to its end.
- **Containment:** after every tab switch and scroll, the document keeps
  `scrollWidth <= innerWidth` and the drawer sits inside the viewport.
- **Health:** the page runs with zero console errors / page errors.

## Results

| Width | Tab strip | Long spec card | Transcript | Review report | Shots + viewer | Long diff contained | Log feed |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 375 px | Pass (scrolls) | Pass | Pass | Pass | Pass | Pass | Pass |
| 768 px | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| 1280 px | Pass | Pass | Pass | Pass | Pass | Pass | Pass |

No production CSS correction was indicated: the drawer body owns vertical
scrolling, the phone tab strip scrolls instead of clipping, the long diff
scrolls horizontally inside its own `<pre>`, and every long-content surface
ends inside a scroll container the user can drive to the end.

## Limitations

The pass does not claim physical-device testing — viewport emulation in
headless WebKit only. The fixture content is transport-stubbed, not
API-backed production task data, but it flows through the production stores
and component. The PM, Tokens and Debug status views have no long-content
fixture here; they are checked for wiring and containment.

## Reproduction

Run `bun run test -- task-drawer-long-content-browser.test.ts` from the
repository root. WebKit checks skip when the bundled WebKit executable is
unavailable; everything stays headless either way.
