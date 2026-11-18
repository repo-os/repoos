# Android Hub web UI fixture QA — November 2026

Task #1171. A fixture-driven sweep of the Android Hub Vite UI (`mobile/`) at
phone width, run before device QA (#1162). Everything below was observed in the
browser run recorded here; nothing was checked on a real device.

## Setup

- `bunx vite --port 5188` in `mobile/` (served on `localhost:5188`).
- Headless Chromium via Playwright, viewport **375 × 812**, device scale 2,
  `platform=android`.
- For each state: no horizontal page scroll (`scrollWidth === 375`), no
  element extending past the viewport, no console or page errors, and a
  screenshot read by eye.

## Fixture states

| Route | What it shows | Result |
| --- | --- | --- |
| `?fixture=many&platform=android` | Three reachable servers, server list, footer actions | Pass |
| `?fixture=one` | One reachable server | Pass |
| `?fixture=empty` | "Add your first server" empty state | Pass |
| `?fixture=unreachable` | Offline state: one row with red "Unreachable" | Pass |
| `?fixture=settings` | Appearance, device lock, about | Pass |
| `?fixture=add` | Add-server form | Pass |
| `?fixture=discover` | Tailnet results, "Already saved", "Needs HTTPS", failed-machine group | Pass |

## Interaction states (not in the fixture list)

| Flow | Result |
| --- | --- |
| `many`: ⋮ on a row opens the Edit server sheet | Pass. URL wraps inside the sheet. |
| `add`: enter `http://…` and press Save | Pass. Inline red error "Enter an HTTPS URL (e.g. https://dev.repoos.org)." sits under the field; buttons stay on-screen. |
| `discover`: expand "Couldn't check these machines" | Pass. |
| `many` with a 66-character server name and a long URL | **Defect, fixed.** See below. |
| `discover` with the same long name and URL | Pass. |
| `many` with an 85-character URL and no break points | Pass after the fix. The picker and sheet stay in bounds. Not measured before the fix. |

There is no `?fixture=error` route. The error states above were reached by
interaction, so future sweeps need that path to be re-typed by hand.

## Defect found and fixed

**Long server names pushed the row past its card (375px).** Each picker row is
a `<button class="server-row">` inside a flex card with `overflow: hidden`.
A button is a flex item with `min-width: auto`, so its nowrap name and host set
its minimum width. The row grew to about 570px, the card clipped it, and the
⋮ edit button was pushed out of view. The name's start was cut off too.

Reproduced on this branch with only the fix reverted, at a 375px viewport: the
row's right edge is at 587px, the card's at 359px, and the ⋮ button ends at 635px.

Fix (`mobile/src/style.css`): `.server-row` gets `min-width: 0`. The existing
`.server-meta` / `.server-name` / `.server-host` ellipsis then truncates, and the
⋮ button and chevron stay on the card.

Only `.server-row` had this shape among the hub's `flex: 1` rules. The
discovery cards are full width with a `min-width: 0` text column already, and
they stayed in bounds in the long-name run.

Test: `src/ui-app/tests/mobile-hub-picker-layout.test.ts` pins the declarations
(jsdom cannot lay out). The pre-fix stylesheet fails the `.server-row` check.

## Not covered by this run

- **Real Android devices and WebViews.** Human device QA is #1162. Nothing here
  is device evidence.
- **iOS.** Only `platform=android` was rendered.
- **Live reachability.** Fixture rows get their status from fixture code, not a
  network check. The "Checking…" state was not exercised.
- **Device lock overlay** and the dev-update dialog.
- **Widths other than 375px.** A narrower phone (320px) was not tested.

## Re-running

```sh
cd mobile && bunx vite --port 5188
# then open http://localhost:5188/?fixture=many&platform=android
# and the other fixture routes above, at 375px.
```
