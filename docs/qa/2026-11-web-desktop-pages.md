# Web desktop pages QA — 2026-11-18

## Result

No reproducible defects were found on Agents, Checks, Settings, or Releases in this pass. All four routes returned HTTP 200 at a 1440 × 1000 desktop viewport. The browser run captured no page errors, console errors, or failed network requests. The pass skipped the already-covered #1157 and #1168 flows.

## Environment and coverage

- Started the worktree's auth-less app with `just serve-noauth 7272` (RepoOS 0.5.89, Bun 1.4.4).
- Exercised it with Playwright Chromium 153.0.8012.12 at 1440 × 1000 from the same runner host. The separate computer-use Chrome could not reach the runner's loopback address, so the in-runner browser was used to drive the local server.
- Agents: clicked all nine section controls (Agents, Build Your Team, Scheduled Tasks, Reminders, Detected Coding Agents, Model Playground, Model providers, Budget Controls, Model routing). Each control responded; navigation reached the Model routing tab.
- Checks: clicked Now, Runs, Test suite, and Check plan; each tab reported selected. The Refresh control completed.
- Settings: clicked General, Notifications, Security, Advanced, Import/Export, Support, and repoos.toml; each tab reported selected.
- Releases: Refresh completed, the release email Preview opened and displayed its content, and a channel Copy control was clickable.
- Across the route and interaction pass, captured zero JavaScript page errors, console errors, and failed network requests.

## Scope limits

The pass did not invoke controls that make external or persistent changes, including model tests, agent edits, release creation/publication, and release email sending. It also did not attempt import/export. The release notes generation and publish flow covered by #1168 was not repeated. No issues were observed that warranted a code fix or an additional test.
