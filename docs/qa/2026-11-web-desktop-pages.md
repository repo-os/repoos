# Web desktop pages QA — 2026-11-18

## Result

The desktop pass covered Agents, Checks, Settings, and Releases at 1440 × 1000. It found one UI defect in Settings import/export and verified the fix: applying an export used to hide its success notice while the config store reloaded. Settings now refreshes without unmounting the page. The regression test and the rerun both confirm the “Applied” notice remains visible.

All four routes loaded without page errors, console errors, or failed local requests. The QA run skipped the already-covered #1157 and #1168 scenarios.

## Environment

- Started the auth-less worktree app with `just serve-noauth 7272` (RepoOS 0.5.89, Bun 1.4.4).
- Used Playwright Chromium 153.0.8012.12 at a 1440 × 1000 viewport. The in-runner browser could reach the task server; the separate computer-use Chrome could not reach the runner’s loopback listener.
- Critical writes were intercepted in the browser and answered with fixtures. No real model provider call, settings write, release publication, or email delivery occurred.

## Page and control coverage

- **Agents:** Opened all nine sections (Agents, Build Your Team, Scheduled Tasks, Reminders, Detected Coding Agents, Model Playground, Model providers, Budget Controls, Model routing). Clicked a model compatibility Test control; the intercepted `/api/models/test` request returned a passing fixture and the result rendered. Added a temporary custom agent; the autosave PATCH was intercepted and contained that agent. No config was persisted.
- **Checks:** Opened Now, Runs, Test suite, and Check plan; each became selected. Refresh completed.
- **Settings:** Opened General, Notifications, Security, Advanced, Import/Export, Support, and repoos.toml. Downloaded an export, selected that file for import, reviewed it, and applied it. The config PATCH was intercepted. After the fix, the page displayed the “Applied” result and remained on Import/Export.
- **Releases:** Refresh completed, the release email Preview rendered, and a distribution Copy control responded. With an isolated clean/main release fixture, opened Cut next release, entered version `0.5.90` and notes, then clicked Publish. The `/api/release` POST was intercepted and returned a simulated successful run; the completion message rendered. A fixture release-email card for `qa@example.test` was used to click Send now and confirm Send; `/api/release/email/send` was intercepted and returned a simulated sent result. No release was created or published, and no email was delivered.

The final browser run captured zero page errors, zero console errors, and zero failed local requests. All mutating UI flows listed in the review finding reached their request boundary with fixture responses, so no provider or production side effect was performed.

## Fix and regression coverage

`SettingsImportExport` refreshed the config store after applying server-side settings. The store’s normal `load()` path flips `loaded` false, which unmounted Settings’ panel body; the import component then wrote its success message into an unmounted instance. The store now accepts `keepLoaded` for this refresh, keeping the already-rendered page mounted while updating its form data. The new config-store test checks visibility state during the refresh, and the existing import component tests verify the PATCH and success message.

Verification run: `bun run test -- config-store.test.ts settings-import-export.test.ts` passed (29 tests across the selected and always-run files). `REPOOS_CHECK_CHANGED=main repoos check` also passed, including build, scoped tests, and UI smoke.
