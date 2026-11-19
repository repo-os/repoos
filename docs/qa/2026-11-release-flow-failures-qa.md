# Releases publish flow failures QA — 2026-11

## Scope and setup

QA covered the **Cut a release** drawer and the release-notes editor on the
Releases page (`/releases`, opened with `?drawer=cut`). The run used headless
Playwright WebKit against the built UI (`dist/ui`), served by the shared UI
harness from a throwaway fixture root.

Every `/api/**` request was intercepted. The catch-all answers 404 and never
continues to the real server, so the real release API was not called and no
release, tag, or push could happen. The only pass-through is the `/api/events`
stream. Each scenario counts the `POST /api/release` requests it sees.

Layout checks ran at 375, 768, and 1280 px. The browser was headless throughout.

## Results

| Scenario | What the stub simulated | Result |
| --- | --- | --- |
| Blocked checkout | Dirty tree (`clean: false`) | The drawer says publishing is disabled and why. Publish is disabled. Enter sends no request. Passes at all widths. |
| Tag already exists | `blockers: ["v0.7.0 already exists."]` | **Failed before the fix.** The drawer did not show the blocker, and Publish stayed enabled. Passes after the fix. |
| Server offline | `POST /api/release` aborted | The drawer shows "Can't reach the RepoOS server". The typed version and notes are kept. One POST is counted and no run starts. Passes at all widths. |
| Check run failed with long output | Run poll returns `failed` with a 400-line log | The headline names the phase ("during checking") and says one or more tests failed. The full log stays in the drawer. No horizontal overflow at any width. |
| CI workflow failed after the tag | `ciFailure` set, no channels returned | **Failed before the fix.** The CI alert was not rendered at all. Passes after the fix. |
| Long notes | About 6,300-character draft with an unbroken 1,400-character URL | No page or drawer overflow at 375, 768, or 1280 px. Edits after resizing still round-trip. |
| Enter with no version | Focus the version field and press Enter | No POST is sent and Publish stays disabled. |

## Findings fixed

- **Tag-exists blocker was invisible in the drawer, and Publish stayed on.**
  The drawer only explained a non-clean or off-branch checkout. Named blockers
  (for example "v0.7.0 already exists.") appeared only in the main panel, and
  Publish did not depend on them. Now the drawer lists the blockers under
  "Publishing is blocked until these are fixed", and Publish is disabled while
  any blocker is present. `release()` refuses the same case, so Enter cannot
  bypass the disabled button.
- **A failed CI workflow was hidden when no channels came back.** The "Published
  to" section rendered only with channels, a load in flight, or a refresh error.
  A `ciFailure` with an empty channel list rendered nothing. The section now
  also renders for a CI failure.
- **The CI-failure alert named the problem but not the next step.** It now says
  to open the failed run, fix the cause, and re-run the failed jobs, or cut a new
  version if the fix needs new code.
- **"Already exists, so nothing was published" gave no next step.** The server
  message in `src/server/routes/release.ts` now adds "Pick a new version number
  and publish again."

## Not verified

- No real release, tag, push, or CI run was executed. The CI-failure and
  already-exists states are fixture-driven, not observed from GitHub or the git
  remote.
- The offline case is a simulated aborted request in the browser. It is not a
  real network outage or a stopped server.
- Notes have no separate save endpoint. The textarea value is sent with the cut,
  so "saved" was checked as the value surviving a failed attempt and a resize,
  not as a server-side draft.
- No screenshots were captured for this note. Layout claims rest on the
  document-width and overflow measurements in the test file.
- Human-only checks remain for a real device and a real browser profile.

## Verification

- `src/ui-app/tests/releases-publish-failures-browser.test.ts`: 8 tests pass,
  run headless against the built UI with the `/api` stubs above.
- The Releases-related UI test files (16 files, 382 tests) pass under
  `src/ui-app/vite.config.ts`.
- The UI build, including the `vue-tsc` type check, passes.
