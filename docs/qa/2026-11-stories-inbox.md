# Stories, Inbox and agent activity QA — November 2026

## Scope and setup

Ran the task worktree's auth-less development server with `just serve-noauth 7272` and exercised the Stories route, the Inbox-filtered Work queue, and Agents last-run activity. Browser access through the computer-use host was unavailable, so I used the worktree's installed Playwright runtime against that local server. The Agents activity view used the `agents:lastRuns` preview fixture; Stories and Inbox used the current task worktree's repository data.

Checked each view at 1280px and 375px. Checked browser console errors and page-level horizontal overflow. At 375px, opened a story panel and a task detail drawer, expanded a failed agent-run detail, and changed the Inbox priority quick filter and Stories completed-story filter.

## Results

| View / interaction | 1280px | 375px | Result |
| --- | --- | --- | --- |
| Stories list and story panel | No page overflow | No page overflow; panel opens as a phone-sized overlay | Pass |
| Inbox list and task drawer | No page overflow | No page overflow; task detail uses the full-screen phone layout | Pass |
| Inbox P2 quick filter | — | Selected state updates and the list count changes | Pass |
| Stories hide-completed filter | — | Hides completed stories after the list is loaded | Pass |
| Agents last-run activity | No page overflow | No page overflow; failed-run detail remains within the viewport | Pass |
| Console errors | None observed | None observed | Pass |

The Work queue's quick-filter strip is an intentionally horizontally scrollable region; it does not widen the page. Agent run details include the failure summary and an “Open task log” link. The Stories view loaded the repository's populated story groups, so an empty Stories screen was not available in this live data pass. The existing Stories view tests cover disabled and zero-task states.

## Follow-up

No reproducible defect was observed, so this QA pass did not require a source fix or a new regression test. The screenshots used during inspection were temporary local captures and are not committed as product assets.
