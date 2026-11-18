# Agents tabs QA — 2026-11

## Scope and setup

QA covered **Build Your Team**, **Scheduled Tasks**, **Reminders**, and
**Detected Coding Agents** on the auth-less `just serve-noauth 7278` instance,
started from a detached scratch worktree under this task worktree. Browser
checks used headless Playwright WebKit only. Layout checks ran at 1280×900 and
375×812. The scratch server reported RepoOS 0.5.91, Bun 1.4.4, and build
993c953.

## Results

| Tab | Browser observations | Result |
| --- | --- | --- |
| Build Your Team | Ross and CTO team cards plus built-in agent cards loaded. At 375px the document stayed 375px wide. | Pass for render and horizontal overflow. Persistence could not be verified. |
| Scheduled Tasks | The `agents:scheduledSeeded` fixture rendered its incomplete-template warning and seeded schedule. The server-backed list also loaded two stored schedules. At 1280px and 375px there was no horizontal overflow. | Render and layout pass. Save attempt was rejected by the preview server (HTTP 405); the form kept its entered values and showed the returned error. |
| Reminders | The `reminders:due` fixture showed due and upcoming reminders, their links, and actions. At 1280px and 375px there was no horizontal overflow. The reminder editor fit the 375px viewport. | Render and layout pass. Creating a reminder was rejected by the preview server (HTTP 405); the editor showed “preview servers are read-only”. |
| Detected Coding Agents | The live PATH snapshot populated rows and the loading/cache status. The refresh/update-check action was not invoked because it contacts a public source. At 1280px and 375px there was no horizontal overflow. | Render and layout pass. Error announcement behavior is covered with a mocked failure in the UI test. |

The preview child enforces read-only behavior for every non-GET request. This
means that this authorized server setup cannot verify that schedule, reminder,
or agent edits persist after reload. The rejection is server-side and is not
evidence of a product save failure. No data was changed in the scratch checkout.

## Findings fixed

- Schedule save and update failures were visible but did not expose an alert
  live region. The schedule list error and schedule editor error now use
  `role="alert"`; a test verifies the failure is announced and the editor stays
  open so the user can retry.
- Detected-agent update-check failure had no live region. It now uses
  `role="status"`; a test verifies the message is announced while the cached
  detection remains visible.

## Verification

- `src/ui-app/tests/schedule-panel.test.ts` and
  `src/ui-app/tests/agents-detected-loading.test.ts`: 27 tests passed across
  targeted runs (including the test runner's boot-timing pass).
- Browser checks used headless WebKit at the viewport sizes above. All four tab
  routes loaded; measured document width matched the viewport width at 375px.
- Persistence across reload remains unverified due to the preview server's
  enforced read-only policy. A writable authorized environment is required to
  complete that portion of the desired UX check.
