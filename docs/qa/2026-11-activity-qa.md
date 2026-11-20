# Activity QA — November 2026

## Scope

"Activity" is the Control dashboard (`/`), whose live activity feed (`FeedPanel`) is the activity log. On phones the bottom tab bar's "More" sheet lists it as "Activity". There is no page named "Insights" in the UI, router, nav or docs, so the Insights half of the task had nothing to walk.

## Method

Headless WebKit (Playwright only) against the built UI in `dist/ui`, served from a scratch Bun server, with every `/api/*` call fixtured: `/api/auth/me` signed in, `/api/events` aborted, everything else 503. Measured at 375, 768 and 1280 px:

- document width against the viewport, plus any element that overflowed outside its own scroll box;
- page errors;
- a focus ring on every visible focusable control (`a[href]`, buttons, inputs, `[tabindex]`).

## Results

- No horizontal overflow at any width. Document width equalled the viewport.
- No page errors. Usage and resource panels showed their unavailable and waiting states.
- Every focusable control on the page showed an outline or box-shadow focus ring.

## Fixes

- **Feed markup.** Several feed messages put free text straight into `v-html` without escaping: task titles on creation, self-heal notes, auto-approve rules, preview URLs, review errors, run labels and the generic error message. They now go through `escapeHtml`, which also coerces missing fields to an empty string so a partial event cannot throw in the SSE handler.
- **Dead SSE branches.** The browser subscribes to a fixed list of server event names. Seven types with store handlers were missing from it, so those handlers never ran: `task.autoApproved`, `task.debugTldr`, `task.doneErrorTldr`, `agent.queued`, `agent.dequeued`, `auto-engineering.state` and `bookkeeping.recovered`. They are now subscribed. `board.alert`, `release.notesRun` and `supervisor.heartbeat` have no store handler and stay unsubscribed.

## Tests

`src/ui-app/tests/repo-store.test.ts`: a table-driven test feeds an `<img onerror>` payload through each changed feed branch and asserts it arrives escaped; a second table asserts each newly subscribed event name is registered on the EventSource.

## Not changed

- A failed-request toast can sit over the page title at 375 px. Toasts float by design, and the error text is correct, so this was left alone.
