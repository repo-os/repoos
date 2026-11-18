# Releases and restart notice QA — 2026-11-18

## Result

The QA pass found and fixed one UI defect: the update notice rendered “1 agents” and “1 checks.” The count labels now use singular forms when the count is one, with component tests covering 0, 1, and multiple agents/checks. No release was cut or published, no tag or push was made, and no restart action was invoked.

This record distinguishes what was exercised from the round-one reviewer’s re-capture requests. The prior visual captures are retained locally under ignored `.repoos/qa-evidence-1168/` and `.repoos/qa-pass-1168/`; they are not attached to this task yet. The reviewer correctly noted that some chooser and dark-mode captures were taken during transitions. Those captures do not establish settled-state readability. A later recapture attempt in `.repoos/qa-pass-1168-round2/qa-round2.mjs` did not reach the chooser because its UI setup left “Generate with AI” disabled. Therefore this turn does not claim that the requested settled chooser recapture or 390px chooser capture was completed.

## What was driven

A prior pass launched `just serve-noauth 7278` from the disposable `.repoos/qa-scratch-1168` worktree. It used Playwright request interception for release and notes endpoints, and selected both Notify and Publish. It observed pending UI states and reload persistence in the intercepted setup, then canceled pending actions. The browser did not press Publish. A failure-path test seam was used in code tests; the requested failed-draft browser screenshot is absent. No external release or agent operation was allowed by the stubs.

The served test instance and run did not use port 7371; that value in the earlier record was an error. The screenshots under `.repoos/qa-pass-1168/` show the task-worktree title bar and are from the earlier 7371 attempt; they are not evidence from the scratch server. The first evidence set under `.repoos/qa-evidence-1168/` is the 7278 scratch run.

## Restart notice coverage and limits

The first evidence set contains screenshots for hand-run, launchd, and systemd notices at 1440 and 390 widths in light and dark themes. The second evidence set contains another 12 supervisor/viewport/theme captures. These are the files present in the two ignored directories, not committed artifacts. Review round one found several dark captures mid-transition; settled dark readability must be recaptured before treating that portion as verified.

The hand-run notice presents a “Restart now” action and says RepoOS will relaunch with recorded serve flags and port. It does not print the actual flag or port values. launchd and systemd display restart actions without `launchctl`/`systemctl` command text, consistent with the component tests. The “uncertain supervisor” state is the one that displays a manual command; this state was missing from the earlier screenshot matrix. A component test now verifies the scoped command `repoos restart --root /fake/project --port 7123` and that the restart button is absent for that state.

## Defects and disposition

- **Count pluralization — fixed with tests.** Both labels now pluralize independently. Tests cover (2,1), (1,2), (1,1), and (0,0).
- **Chooser screenshot timing and mobile chooser — evidence gap.** Round one did not provide a settled dark chooser capture or 390px chooser capture. The recapture attempt failed before opening the chooser, so these remain unverified.
- **Uncertain supervisor command — clarified and tested.** launchd/systemd use visible restart actions; the uncertain state shows the explicit CLI command. The component test verifies that state.
- **Hand-run actual flags/port — copy scope clarified.** The existing notice describes replaying recorded flags and port without exposing their values. The earlier QA wording overstated what the screen showed; no product defect is asserted from that wording alone.

No larger defect was confirmed that needs a follow-up task. Screenshots remain outside git. Attachment to the task drawer is still outstanding.

## Verification

- `bun run test:vitest -- src/ui-app/tests/releases.test.ts` — passed, 44 tests after correcting the uncertain-supervisor assertion.
- A full `REPOOS_CHECK_CHANGED=main repoos check` was run before that assertion correction and failed in the scoped tests on the incorrect assertion. It has not yet been rerun successfully in this record.
