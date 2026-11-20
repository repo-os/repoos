# Update banner, version display and release notes QA — 2026-11-20

## Result

The update banner, the release notes modal, the installed-version restart
notice and the sidebar version label were checked headless at 375, 768 and
1280 px. Four product defects were fixed with regression tests: restart copy
used internal wording, the active-work sentence read as a fragment, the
"waiting" line rendered at dialog body size, and release-note bullets lost
their markers. The failure fixture also omitted the command to run by hand, so
its capture read "Run in a terminal." Restart and dismiss were verified against
fixtures only. No real server was restarted, and no live restart outcome is
claimed.

## What I drove

`bun docs/qa/measure-update-banner.mjs --shots .repoos/qa-1255` serves the built
SPA from a throwaway fixture root through the shared ui-harness, then runs
headless WebKit. It never opens a visible browser. The update endpoints
(`/api/update-status`, `/api/update-status/restart`, `/api/release/available`,
`/api/release/run`) are answered by Playwright route interception. The restart
POST is recorded and faked, so no supervisor, helper or real restart is reached.
Each scenario gets a fresh browser context, so dismissals from one run do not
leak into the next.

## States covered

| State | How it is driven | 375 | 768 | 1280 |
| --- | --- | --- | --- | --- |
| Available update banner and release notes modal | Route fixture, `latestVersion` 0.6.0 | pass | pass | pass |
| Dismissed banner (Not now, and the X) | Real clicks, then reload | pass | pass | pass |
| Supervised restart (systemd) | Route fixture, `supervised: true` | pass | pass | pass |
| Hand-run restart | Route fixture, `supervisorKind: none` | pass | pass | pass |
| Restart failure (POST returns 500) | Hand-run route, error response | pass | pass | pass |
| Restart failure fixture (`release:restartError`) | Built-in fixture | pass | pass | pass |
| Restart notice dismissed, stays closed on reload | Real X click, then reload | pass | pass | pass |
| Sidebar version label | Real app shell | hidden | hidden | `v0.5.92` |

Each restart state also clicked Restart when idle, Cancel and Restart now. The
recorded POST bodies were `{whenIdle:true}`, `{cancel:true}` and
`{whenIdle:false}`, in that order, which is what the restart route expects.

Checks at each state: copy names both versions and says what a restart does;
the dialog and modal sit inside the viewport; every button is hit-testable
(not covered by another element); the banner does not overlap mobile
navigation; release notes render with markers; no uncaught page errors.

## Defects found and fixed

1. **Restart copy used internal wording.** The hand-run copy said "recorded
   serve flags", and the notice linked "#0214" as its only reference. It now
   reads "same settings and port it was started with", and the link text is
   "Read more on GitHub". Test: `words the restart notice in plain English,
   without internal jargon (#1255)`.
2. **Active-work sentence was a fragment.** "2 agents and 1 check running."
   now reads "are running", and the pluralization table expects it. Test:
   `pluralizes active work counts`.
3. **The "waiting" line was unstyled.** "Restart is waiting for agents, reviews
   and checks to finish." rendered as a bare span at dialog body size in both
   the supervised and hand-run layouts. It is now a muted paragraph on its own
   row, like the failure alert. The harness checks that its computed size is
   12 px. The supervised waiting line also carries the row class, so it no
   longer shares a row with Cancel. Test: `gives the waiting line the muted size
   on its own row (#1255)`, which requires the class on both the supervised and
   hand-run lines.
4. **Markdown bullets had no markers.** Preflight sets every list to
   `list-style: none`, so each markdown surface lost its markers while keeping
   its indent. One shared rule in `style.css` now restores disc and decimal
   markers on every rendered-markdown container: `md-rendered` (story bodies,
   review reports, context and inputs), `pm-markdown`, `cto-markdown`,
   `debugger-markdown`, `td-markdown` (task debugger chat), `guide-markdown`
   (repo guide chat), `playground-markdown` and `release-update-markdown`.
   Test: `src/ui-app/tests/markdown-list-markers.test.ts`. It checks every
   `v-html` in a file that imports `renderMarkdown`/`renderChatMarkdown`, so
   computed surfaces such as `v-html="specHtml"` are covered as well as literal
   calls. A surface whose container class lacks a rule fails the test. Markdown
   rendered by a child component is not scanned, so its container class must be
   added to the shared rule by hand. A static list of required containers in the
   test also fails if one of those classes loses its rule. The playground
   also gets the same 17 px list indent as the others, because it had none. The
   release-notes harness check verifies the computed `list-style-type` at every
   width.
5. **The restart failure fixture had no command to run.** The fixture omitted
   `restartCommand`, so its alert read "Run in a terminal." The real status
   route always sends the command, so this was a fixture defect. The fixture now
   includes it. Test: `names the command to run in the restart failure fixture
   (#1255)`.

Harness, not product, defects that were also fixed in the script: the modal
check read `innerText`, which uppercases "Installed", so the check now reads
`textContent`; WebKit reports requests aborted by a reload as "due to access
control checks" page errors, which the script filters out with a comment; the
deliberate 500 in the failure scenario is no longer counted as an error. The
"dialog fits" check failed on the "Read more on GitHub" link in about half of
runs. The link wraps onto two lines, and the check hit-tested the union box of
its fragments, whose centre falls in the gap between lines. The check now
hit-tests each line fragment. The failing fit checks now print their
measurements, so a real overflow would show its numbers.

## Observations, not changed

- **The sidebar version label was not visible at 375 and 768.** The harness
  measured `.build-ver` as not visible there; I did not trace the CSS cause. The
  installed version still appears in the restart
  notice title and in the release modal ("Installed" and "Available") at every
  width, so no version information is lost on narrow screens. I left the layout
  alone.
- **The top bar "New version available" button** calls `repo.restartServer()`
  directly. It has no dialog, no "Restart when idle" and no dismiss. It is not
  one of the four required states and this pass did not cover it. It is a
  candidate for a follow-up task.
- The uncertain supervisor state is not part of this run. It is covered by an
  existing mount test ("shows the scoped restart command when supervisor
  detection is uncertain") in `releases.test.ts`.

## Limits and human follow-up

- Nothing here restarted a real server. The restart POST was faked, so "Restart
  now" proves the UI sends the request and shows the accepted state. It does not
  prove that a service manager or a hand-run server comes back. A human should
  run one real hand-run restart on a disposable server if that proof is needed.
- WebKit only, matching the other QA passes in `docs/qa/`. No Chromium or real
  iOS Safari pass was done.
- Screenshots are in the gitignored `.repoos/qa-1255/` folder and are not
  committed. Declared review shots are attached to the task.

## Verification

- `bun docs/qa/measure-update-banner.mjs --shots .repoos/qa-1255`: before the
  fixes, 126 checks with 18 failures. Of those, 6 were product copy defects
  (`#0214` on supervised and hand-run, three widths each), 3 were the restart
  failure fixture's missing command, and 9 were harness artifacts (modal case,
  reload-abort noise, the deliberate 500). After the fit-check fix, eleven runs
  on the same build: nine had 135 checks with 0 failures. Two were not clean.
  One run failed three fit checks before the fix landed, and the fix removed
  that failure in every later run. One run, after the fix, failed one check:
  "supervised: scenario ran @375", a timeout waiting 5 s for the "Restart is
  waiting" line after Restart when idle. It did not reproduce in six further
  runs. I have not identified its cause. It may be a real race between the 1.5 s
  status refresh after the POST and the harness wait, or harness load. Treat it
  as an open intermittent failure, not a fixed one, until it is explained or a
  longer run shows it is gone.
- `bun run test:vitest -- src/ui-app/tests/releases.test.ts
  src/ui-app/tests/markdown-list-markers.test.ts src/ui-app/tests/update-status.test.ts`:
  89 passed.
