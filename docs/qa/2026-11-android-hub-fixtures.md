# Android Hub web UI fixture QA — November 2026

Task #1171. A fixture-driven sweep of the Android Hub Vite UI (`mobile/`) at
phone width, run before device QA (#1162). Everything below was observed in the
browser run recorded here; nothing was checked on a real device.

## Setup

- `bunx vite --port 5188` in `mobile/` (served on `localhost:5188`).
- Headless Chromium via `@playwright/test`, viewport **375 × 812**, device
  scale 2, `platform=android`.
- The checks are in `mobile/scripts/fixture-qa.ts`, so every number below can be
  rerun from the branch. For each state it checks that no element extends past
  the viewport and that the console is clean. For each wrapping case it checks
  that every element's `scrollWidth` is at most its `clientWidth`. Element
  bounds are used rather than page `scrollWidth`, because `body` has
  `overflow: hidden` and hides overflow at the page level.
- Screenshots were read by eye during the run and are not committed.

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
| `many`: ⋮ on a row opens the Edit server sheet | Pass for the fixture's short URLs. A long saved URL was clipped until the wrap fix below; with it, a 119-character path URL wraps inside the sheet at 375px. |
| `add`: enter `http://…` and press Save | Pass. Inline red error "Enter an HTTPS URL (e.g. https://dev.repoos.org)." sits under the field; buttons stay on-screen. |
| `discover`: expand "Couldn't check these machines" | Pass. |
| `many` with a 66-character server name and a long URL | **Defect, fixed.** See below. |
| `discover` with the same long name and URL | Pass. |
| `many` with an 85-character URL and no break points | Pass after the fix. The sheet's URL wraps within its box (343 of 343px). The picker row truncates the host with an ellipsis by design, so its text is wider than the row. |
| Long unbroken server-supplied text: a 120-character discovery reason, a discovery message, a form warning | Pass after the wrap fix. Each element's `scrollWidth` equals its `clientWidth`. Without the fix they overflowed (for example 720px of content in a 317px reason row). |

There is no `?fixture=error` route. The error states above were reached by
interaction, so future sweeps need that path to be re-typed by hand.

## Defect found and fixed

**Long server names pushed the row past its card (375px).** Each picker row is
a `<button class="server-row">` inside a flex card with `overflow: hidden`.
A button is a flex item with `min-width: auto`, so its nowrap name and host set
its minimum width. The row grew to about 570px, the card clipped it, and the
⋮ edit button was pushed out of view. Only the row's right end was clipped, so the name still began at its normal position and ran off the card's edge.

Reproduced on this branch with only the fix reverted, at a 375px viewport: the
row's right edge is at 587px, the card's at 359px, and the ⋮ button ends at 635px.

Fix (`mobile/src/style.css`): `.server-row` gets `min-width: 0`. The existing
`.server-meta` / `.server-name` / `.server-host` ellipsis then truncates, and the
⋮ button and chevron stay on the card.

Only `.server-row` had this shape among the hub's `flex: 1` rules. The
discovery cards are full width with a `min-width: 0` text column already, and
they stayed in bounds in the long-name run.

**Same class, text that never wraps.** Server-supplied text had no
`overflow-wrap`, so one unbroken token overflowed its box and was clipped
silently. Affected, each now with `overflow-wrap: anywhere`:

- the Edit sheet's server URL (`.hint`);
- the discovery message and form warning (`.discovery-message`, `.warn`);
- the failure-row reason (`.reachability`);
- the dev-update dialog's commit notes (`.update-dialog`, inherited by its
  heading, paragraphs and list items). The notes come from a remote
  `latest.json`, so this is the one place where text is not fixed UI copy.

`.form-error` also lacks wrapping, but every string it can show is fixed copy,
so no unbroken token reaches it. The `.server-name`, `.server-host` and
`.discovery-trust-host` elements truncate with an ellipsis by design.

Test: `src/ui-app/tests/mobile-hub-picker-layout.test.ts` pins the declarations
(jsdom cannot lay out), and the pre-fix stylesheet fails the `.server-row` check.

## Not covered by this run

- **Real Android devices and WebViews.** Human device QA is #1162. Nothing here
  is device evidence.
- **iOS.** Only `platform=android` was rendered.
- **Live reachability.** Fixture rows get their status from fixture code, not a
  network check. The "Checking…" state was not exercised.
- **Device lock overlay.** Not rendered in the sweep.
- **Dev-update dialog, real trigger.** Its layout is checked by injecting the
  dialog's markup. The sweep never fetches the remote manifest that opens it.
- **Widths other than 375px.** A narrower phone (320px) was not tested.

## Re-running

```sh
cd mobile && bunx vite --port 5188
# then open http://localhost:5188/?fixture=many&platform=android
# and the other fixture routes above, at 375px.
```

The script runs the interaction states and the long-text cases automatically:

1. **Edit sheet:** on `?fixture=many`, tap the ⋮ button on the first row.
2. **Add-form error:** on `?fixture=add`, set the URL to `http://insecure.example.test`
   and press Save. The HTTPS error appears under the field.
3. **Failure group:** on `?fixture=discover`, expand "Couldn't check these machines".
4. **Long text:** the fixtures carry short names, so the script rewrites the served
   `src/fixture.ts` to put a long URL or `reason` into the list, and injects the
   message, warning and dev-update note elements with the shell's real classes.

To see the wrapping checks fail, run the sweep with the rules removed:
`QA_STRIP_WRAP=1 bun scripts/fixture-qa.ts`. Six wrapping checks and the
dev-update bounds check fail. The picker and row checks still pass, because
they depend on the `.server-row` fix and not on wrapping.

There is no `?fixture=error` route, so steps 2 and 4 are the only error paths.
