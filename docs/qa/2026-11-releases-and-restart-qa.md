# Releases and restart notice QA — 2026-11-18

## Result

The pass exercised the release notes chooser with Notify and Publish, including cancel and reload while pending, and a failed draft using a fake agent response. All release API requests were intercepted in Playwright; the run asserted zero release mutation calls. It did not publish, push, tag, run a real agent, or restart any server. The update notice was rendered for hand-run, launchd, systemd, and uncertain supervisor states at 1440 and 390 widths in light and dark. I inspected every capture listed below after the theme and modal transitions settled.

The pass found one product defect: active work counts always used plural labels. This is fixed and tested. No other defect was found. Screenshots remain in ignored `.repoos/qa-pass-1168-round2/` locally and were attached to task #1168 using `repoos update`; no screenshot binary is in git.

## What I drove

I ran `just serve-noauth 7278` from the disposable `.repoos/qa-scratch-1168` worktree, never from the served checkout. Playwright intercepted the release, notes, and update-status APIs. It opened the cut panel and chooser, checked both choices, started pending Notify and Publish requests, verified the notification copy does not promise publication, reloaded during each pending state, and canceled each. A fake failed-agent response produced the failed-draft state. The script counted zero release mutation calls and did not click Publish.

The first diagnostic attempts exposed two test-harness issues: opening the cut panel by clicking left the fixture in a gated state, so the successful run used the app’s `/releases?drawer=cut` entry point; and the notes lookup POST (`cachedOnly`) was initially mistaken for a real draft request. The stub now handles that read-only lookup separately, which prevented a false pending state. These were harness defects, not product defects.

## Restart notice matrix

The script rendered each state after setting the theme and waiting, then captured all viewport/theme combinations. The notice stayed within the viewport at 390 pixels. The hand-run variant showed “Restart now” and “Restart when idle” and explained that recorded serve flags and port are reused; the actual values are not printed in the copy. launchd and systemd displayed the same restart actions without `launchctl` or `systemctl` commands. The uncertain state showed no restart action and displayed `repoos restart --root /fake/project --port 7123` with the explanation that automatic restart is unavailable.

All 16 captures were visually inspected:

| State | 1440 light | 1440 dark | 390 light | 390 dark |
| --- | --- | --- | --- | --- |
| Hand-run | `restart-hand-run-1440-light.png` | `restart-hand-run-1440-dark.png` | `restart-hand-run-390-light.png` | `restart-hand-run-390-dark.png` |
| launchd | `restart-launchd-1440-light.png` | `restart-launchd-1440-dark.png` | `restart-launchd-390-light.png` | `restart-launchd-390-dark.png` |
| systemd | `restart-systemd-1440-light.png` | `restart-systemd-1440-dark.png` | `restart-systemd-390-light.png` | `restart-systemd-390-dark.png` |
| uncertain | `restart-uncertain-1440-light.png` | `restart-uncertain-1440-dark.png` | `restart-uncertain-390-light.png` | `restart-uncertain-390-dark.png` |

## Release flow captures and disposition

The inspected release screenshots are `release-chooser-1440-light.png`, `release-chooser-390-light.png`, `release-chooser-publish-1440-light.png`, `release-notify-pending-390-light.png`, `release-notify-reloaded-390-light.png`, `release-publish-pending-1440-light.png`, `release-publish-reloaded-1440-light.png`, and `release-failed-draft-1440-light.png`. The chooser says Notify sends a notification and leaves Publish to the operator. Publish describes automatic publish after the notes land and normal checks pass. The failed draft shows “was not published automatically.”

- **Count grammar — fixed with tests.** Agent and check counts now pluralize independently. Tests cover (2,1), (1,2), (1,1), and (0,0).
- **Chooser mobile and transition timing — re-captured.** A settled 390px chooser is included; the dark chooser was not part of this pass because the task only required chooser wording while the supervisor matrix required both themes.
- **Supervisor uncertainty — captured and tested.** The command is visible only when detection is uncertain; launchd/systemd rely on action buttons.
- **Hand-run actual flags/port — copy scope clarified.** The UI says it reuses recorded flags and port but does not enumerate them. This QA record no longer claims that it does.

## Verification

- **Real restart check for #1185: not performed.** This session did not control a real hand-run server or a systemd/launchd managed instance, so no live restart outcome is claimed. The restart flow is covered by automated tests; operator QA remains needed for a real hand-run server.

- **Resumed #1185 engineering session: real hand-run restart still not performed.** This worktree session added regression coverage for the systemd-parent fallback but did not operate a real server, so it does not change the live QA result above.

- `bun run test:vitest -- src/ui-app/tests/releases.test.ts` — passed, 44 tests.
- `REPOOS_CHECK_CHANGED=main repoos check` — passed. Remote validation passed build, 173 scoped tests, and UI smoke; local format, lint, build freshness, contrast audit, and UI smoke passed.
