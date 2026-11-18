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
| Build Your Team | Ross and CTO team cards plus built-in agent cards loaded. At 375px the document stayed 375px wide. A Playwright API stub accepted Ross instruction edits; desktop and mobile edits remained after reload. | Render/layout and simulated persistence pass. |
| Scheduled Tasks | The `agents:scheduledSeeded` fixture rendered its incomplete-template warning and seeded schedule. The server-backed list loaded two stored schedules. There was no horizontal overflow at either width. Playwright API stubs accepted create/edit; each remained after reload. | Render/layout and simulated persistence pass. Direct preview save returned HTTP 405 with an inline error. |
| Reminders | The `reminders:due` fixture showed due and upcoming reminders, links, and actions. There was no horizontal overflow at either width. The editor fit 375px. Playwright API stubs accepted create/edit; each remained after reload. | Render/layout and simulated persistence pass. Direct preview save returned HTTP 405 with an inline error. |
| Detected Coding Agents | The live PATH snapshot populated rows and the loading/cache status. The refresh/update-check action was not invoked because it contacts a public source. At 1280px and 375px there was no horizontal overflow. | Render and layout pass. Error announcement behavior is covered with a mocked failure in the UI test. |

The preview child enforces read-only behavior for every non-GET request. Direct
schedule and reminder saves returned HTTP 405, so real backend persistence
could not be observed. To exercise the UI save/reload flows without changing
server data, Playwright intercepted the relevant API calls and retained an
in-memory response store across reloads. Those checks verify the browser
workflow after successful responses, not RepoOS filesystem durability. No data
was changed in the scratch checkout.

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
- Playwright's in-memory API stub verified team instruction, schedule, and
  reminder changes survive reload at 1280px and 375px. Actual backend
  persistence remains unverified because the preview rejects non-GET requests.
