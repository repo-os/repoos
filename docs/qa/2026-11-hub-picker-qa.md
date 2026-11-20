# Hub server picker and add-server QA — November 2026

Task #1242. Copy and error-state pass over the Android/iOS Hub picker and its add-server form (`mobile/`), run in the browser preview at phone and tablet widths. The sweep is `mobile/scripts/hub-picker-qa.ts`. It is headless Chromium against the `many` fixture, and it contacts no real servers.

## Method

The app was served with `bunx vite --port 5188` from `mobile/`. Playwright runs headless Chromium (`headless: true`). Every request the page makes goes through one route table. The fixture hosts (`ok.example.test`, `gone.example.test`, `page.example.test`, `dead.example.test`, `slow.example.test`) get canned replies, or no reply for the slow case. Any other host is aborted, and the sweep records each host it sees. For every address that the form should refuse before the network, the sweep asserts that no request was made.

The #1242 pass ran four viewports: 360×800 and 412×915 (phone portrait), and 768×1024 and 1024×768 (tablet portrait and landscape), each at device scale factor 2. #1271 added 375×812 and 1280×800, so the script now runs six (see the #1271 section below). At each width the sweep covers the add-server form with 14 addresses and the rename sheet on a saved server.

The sweep ran 340 checks, all passing. Each add case checks that the previous error cleared, the exact message, that the error is announced (`role="alert"`), that no element leaves the viewport, and that the error text fits its box. The refused-before-network cases also check that no request was made.

Setup note: `mobile/` had no `node_modules` in this worktree. `bun install` in `mobile/` installed its declared dependencies. `vue-tsc --noEmit` in `mobile/` passes.

## Results by case

| Input | Message shown (after this pass) | Network |
| --- | --- | --- |
| empty | Enter a server URL. | none |
| `http://…` | This address uses http://, which Hub doesn't connect to. Change it to https:// and try again. | none |
| `file:///etc/passwd` | That address starts with file:, which Hub can't use. Enter the server's https:// address, like https://dev.repoos.org. | none |
| `javascript:alert(1)` | That address starts with javascript:, which Hub can't use. … | none |
| `ftp://…` | That address starts with ftp:, which Hub can't use. … | none |
| `https://…?x=1` | Remove everything after the ? or # in the address. … | none |
| `https://user:pass@…` | Remove the username and password from the address. Hub doesn't store them. Enter just the server's https:// address, like https://dev.repoos.org. | none |
| `https://ok example` | That doesn't look like a web address. Enter the server's address, like https://dev.repoos.org. | none |
| saved address | That server is already saved as "dev". Pick it from the list instead. | none |
| saved name, different case (`DEV`) | A server named "dev" is already saved. Give this one a different display name. | none |
| HTTP 404 | That address answered with HTTP 404, so it isn't a RepoOS server. Check the address, including any path after the host. | mocked |
| 200 non-RepoOS page | That address answered, but it isn't a RepoOS server. Check the address. | mocked |
| unreachable | Can't reach that server. Check the address and your connection, then try again. | mocked, aborted |
| slow (no reply) | The server didn't answer within 10 seconds. Check that it's running and reachable from this phone, then try again. | mocked, app timeout |
| valid RepoOS | Saved and returned to the picker. | mocked |

The rename sheet refuses a name already used by another saved server, and shows the same duplicate-name message inline.

## Defects found and fixed

**Unsafe schemes were rewritten into hosts and fetched.** The old parser prefixed `https://` to anything without an `http(s)://` prefix. So `file:///etc/passwd` became `https://file///etc/passwd`, `ftp://…` became a host called `ftp`, and `http:/…` became a host called `http`. The add form then requested `/api/health` on that host, and reported a generic "Unreachable". The parser now refuses any scheme other than https before it builds a URL, and the message names the scheme. Covered by the table in `src/ui-app/tests/mobile-hub-add-server-errors.test.ts` and by the sweep's no-request check.

**The browser URL parser accepted a space in the host.** Chromium turns `https://ok example` into the host `ok%20example` and sends a request there. Node's parser rejects it, so the first vitest run did not catch it. A single-case browser probe showed the request going out to `ok%20example`, and the sweep's message check failed for it. The host part is now checked against an explicit character set before parsing.

**Query strings were reported as "Enter an HTTPS URL".** A URL like `https://ok.example.test/?x=1` is HTTPS, so that message was wrong. It now says to remove the `?` or `#` part.

**Non-RepoOS pages could be saved.** The health check accepted any 2xx reply, so a sign-in or plain web page was saved as a server. The check now requires `{ "ok": true }` from `/api/health`, which is what the current health handler returns (`src/server/routes/info.ts`). Older RepoOS versions were not checked. This is a stricter rule, and a server that answers 200 without `ok: true` is now refused.

**Duplicate names were allowed, and rename failed silently.** Two servers could share a display name, and the rename sheet closed even when the name was taken. Adds and renames now refuse a name already in use (case-insensitive), and the sheet shows the error inline.

**Duplicate-address and timeout copy was vague.** "That server is already saved." did not say which server. "Timed out — is the server reachable?" and "Unreachable — check the URL and your connection." did not say what to do. Each now names the saved server or the next step.

**Errors were not announced.** The inline error had no live-region role, so a failed Save was silent to screen readers. The add-form error, the rename-sheet error and the tailnet-discovery error now all have `role="alert"`.

**Credentials and underscores.** An address with `user:pass@` was refused with the generic message, which did not say why. It now names the username and password. Hostnames with underscores (`my_server.example.com`), which browsers accept, are now allowed.

**The user docs claimed loopback HTTP works.** `user-docs/android-hub.md` said `http://localhost` was accepted. The code has never allowed plain HTTP, including loopback. The docs now say so, and point to a tunnel for HTTPS. The code was not loosened, because the task requires refusing `http`.

**Test fixture updated.** `src/ui-app/tests/mobile-tailnet-discovery.test.ts` faked the health reply as `{ "status": "ok" }`. It now uses `{ "ok": true }`, the real shape.

## Layout

No element left the viewport and no error text overflowed its box at any of the four widths. This was measured in Chromium at the sizes above. The add form's error text and the rename sheet's error stayed in bounds. No layout CSS changed in this pass.

## Second pass: #1271 (widths 375, 768, 1280)

The sweep now runs six viewports, including the 375 phone and 1280 desktop widths. It passed 510 of 510 checks. The picker list was also walked in each state (many, one, empty, unreachable, add, discover, the rename sheet with a duplicate name, long unbroken URLs, and the busy discovery screen). Those walks were one-off scripts and are not committed. They measured document overflow, elements past the viewport edge, console errors, and whether each Tab-focused control shows a focus cue. They found no overflow and no missing cues.

**The rename sheet trapped keyboard users outside it.** The sheet is a modal dialog. Opening it from the keyboard left focus on the row behind the scrim, and Escape did nothing. `mobile/src/components/BottomSheet.vue` now moves focus into the panel on open, keeps Tab and Shift+Tab inside it, closes on Escape, and returns focus to the control that opened it. The panel itself has no outline (`mobile/src/style.css`). Covered by `src/ui-app/tests/mobile-bottom-sheet-focus.test.ts`. The update dialog in `mobile/src/App.vue` is a dev-only `role="dialog"` with the same gap; it is not in the picker flow and is left for a follow-up.

The 2px focus ring on the form fields (`.field input:focus`) is pinned by `src/ui-app/tests/mobile-hub-picker-layout.test.ts`.

Not reached by fixtures: the reachability "Checking…" label. The `many` fixture sets every server to "Reachable" without a network call, so that label was not seen in a browser.

## Not covered

- No real device, Android WebView, or iOS WKWebView was used. Those engines differ from Chromium, and the URL-parser finding above is an example of that difference. A human needs a device pass before this is called verified on device.
- No real network was used. Reachability is mocked, so "unreachable" and "slow" describe the app's handling of mocked replies, not a real server's behavior.
- Touch targets, the on-screen keyboard, and the Android back gesture were not exercised.
- Older RepoOS servers whose health reply lacks `ok: true` are now refused. The current server returns `ok: true`.
- Discovery (`Find servers on my tailnet`) has one known gap: when two discovered rows share a project name, the second add fails with the duplicate-name message, and the user cannot rename it inside discovery. Not changed here; it needs a design decision on the discovery screen.

## How to repeat

```sh
cd mobile
bunx vite --port 5188
bun scripts/hub-picker-qa.ts
```

The sweep prints one line per check and exits 1 on any failure. `QA_BASE_URL` overrides the origin. Each width waits out the 10-second slow-server case, so the run is slow by design.
