## TL;DR

Task 1247 was a QA pass over the Checks page live run view and its cancel/retry controls at phone (375 px), tablet (768 px) and desktop (1280 px) widths, against seeded fixtures for running, queued, stalled and failed states — headless Playwright only, no real check runs. It shipped in a single engineering round with one review pass (`good to go`) and landed as commit `4ebcbb3a2cb763c84e7417b207fd2da41a915438`. Two real defects were found and fixed: a running check's heading overflowed its box at phone and tablet widths when the machine name had no break point, and a failed "Release slot" action was completely silent on the Now tab (the error rendered only on the Check plan tab); the success path also gave no feedback and gained a confirmation notice. All fixes are covered by a new WebKit responsive-layout test suite (9 tests, passing), and the QA record is committed at `docs/qa/2026-11-checks-live-run-qa.md`.

## Outcome

The task's acceptance criteria were met:

- **Fixture-based headless QA of the live run view.** A new test harness (`src/ui-app/tests/checks-live-run-responsive.test.ts` with fixtures in `src/ui-app/tests/fixtures/checks-live-run-states.ts` and a store stub) runs a Vite server, swaps the repo store for a seeded stub, mocks every `/api/**` call through Playwright routing, and mounts the real `ChecksView`. It tests the four run states at 375, 768 and 1280 px, deliberately using an unbroken 140-character machine name and a 120-character space-free error path — the inputs that break boxes lacking wrap rules.
- **Fix 1 — heading overflow.** The running check's heading row had no wrap and its grid had no `min-width: 0`, so with the unbroken machine name the box exceeded the viewport at 375 and 768 px and the progress line escaped its section. Fixed by making the heading wrap, giving the machine name `overflow-wrap: anywhere`, and setting the section grid to `minmax(0, 1fr)` (`src/ui-app/src/views/ChecksView.vue`).
- **Fix 2 — silent failed release.** The release error was set on the page-level `error` ref, which renders only on the Check plan tab; on the Now tab a failed "Release slot" closed the dialog and showed nothing. Fixed by adding a `slotActionError` alert in the Local check slots section, with the dialog closing on failure so the message is not hidden behind it.
- **Fix 3 — silent successful release.** The success path now shows a notice reading "Released slot N (PID P). The check process group it held was stopped.", matching what the dialog promises.
- **QA doc committed** at `docs/qa/2026-11-checks-live-run-qa.md`, as the task required.

**Scope decision recorded for a future reader:** the Checks page has no cancel or retry control for a live check run. Those controls live on the task card (`TaskCard.vue`, "Cancel stalled check") and in the close-out status bar (`IntegrationStatusBar.vue`). The engineer stated this gap in the QA doc rather than adding buttons, since that would be a product change beyond a QA pass — whether cancel/retry belong on this page is left to a human decision.

**Final verdict:** review pass 1 returned `good to go` (classified as evidence-gap-only — see What went wrong), the close-out gate completed, and the task reached `done` with a `release:success` status.

## Process stats

- **Dev rounds:** 1 (Round 1, 2026-11-19T21:36:43Z, claude code · haiku).
- **Review rounds:** 1 (Pass 1, 2026-11-19T21:38:45Z, verdict `good to go`).
- **Wall-clock start to done:** created 2026-11-19T21:07:03Z, done 2026-11-19T22:02:16Z — 55 minutes 13 seconds.
- **Agents and models:**
  - Engineer: `engineer`, haiku, started 2026-11-19T21:07:12Z, elapsed 121 s, 1,796 tokens, cost $0.5942376. One orphaned engineer process (pid 30233) was adopted rather than restarted; no restarts or model swaps otherwise.
  - Reviewer: `reviewer`, opencode-go/glm-5.3-flash, started 2026-11-19T21:36:45Z, elapsed 120 s, 61,709 tokens, cost $0.03660323.
  - Routing: Model router (jev), unknown model, 0 s, no tokens/cost recorded.
- **Totals where derivable from the recorded per-role figures:** tokens 63,505 (1,796 + 61,709); cost $0.63084083 (sum of the two recorded figures). Per-run cost/token totals beyond these were not recorded.
- **Close-out gate:** completed in 1,071 s.

## What went wrong

Four issues, all resolved:

1. **Orphaned engineer process.** Shortly after start, an orphaned engineer process (pid 30233) was found and adopted by the runner at 21:20:59Z rather than killed and restarted. No rework resulted.
2. **First `repoos check` failed on formatting** in the three changed files. Resolved with `bunx oxfmt`; the second run passed everything (format, lint, build, CSS layers, theme contrast, hardcoded colors, bare-require, branch artifacts, UI smoke, and the remote validation test run — the latter in 234 s on the runner).
3. **Handoff hold.** A CTO nudge at 21:25:58Z recorded the task as held while the handoff gate was running; it cleared normally and handoff completed at 21:36:43Z with one UI verification shot captured and a clean console.
4. **Review evidence gap.** The single automatic handoff capture rendered the dashboard route (`/`), not the Checks page in any of the four seeded states, so the reviewer had no visual evidence of the diff. The reviewer verified the code paths directly (grep of error set/render sites, dialog consumers, the release route) and still returned `good to go`, flagging the missing capture as the only gap. Relatedly, the engineer's first layout assertions passed against a hyphenated machine name — hyphens are legal break points, so the test proved nothing until the fixture was switched to an unbroken name; the unbroken variant was kept. A separate harness bug (router push dropping `liveState`, making every page render the default running seed) was fixed by keeping `liveState` in the pushed route.

No flaky checks, stalls, failed handoffs or crashes beyond the above.

## Learnings

Durable ones worth carrying forward:

- **Layout tests are only as good as their worst input.** A hyphenated fixture passed at every width; an unbroken one failed at two of three. Any box rendering user-controlled text (hostnames, paths, error output) should be tested with an input that has no legal break point. This belongs in `docs/agent-ui-and-preview-conventions.md` or the UI testing docs as a fixture-design rule.
- **A failure path must render where the user is looking.** The release error existed and was set correctly, but on a different tab — invisible on the Now tab. Tests should assert the alert is *visible in context*, not merely that the API was called or that state was set.
- **State-changing actions should say what they did.** A short confirmation naming the affected resource (slot and PID, here) closes the silent-success gap at almost no cost.
- **QA scopes honestly.** Where controls do not exist on the page under test, the right move was documenting the gap rather than building a product change inside a QA task. That matches the existing task conventions and needs no new rule.

## Follow-ups

None — no linked tasks were recorded. Two non-task items worth watching, noted by the reviewer as suggestions rather than filed work: the shared `ConfirmDialog` has no busy/disabled state, so double-clicking the release confirm can send two POSTs and show contradictory feedback (pre-existing); and the new `slotActionNotice`/`slotActionError` are not cleared by the 5 s slot poll, so a release notice can outlive the state it describes. Additionally, the reviewer suggested declaring 1–2 shots for the Checks page Now tab in future UI tasks so review has visual evidence — the gap that made this review evidence-gap-only.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
