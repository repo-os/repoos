# Notices and notifications

The bell in the top bar collects things that happened without you watching:
release runs, and the outcome of every **Move to done** (close-out).

## The notice bell

Every row is one event, with a short title, a one-line detail, and a relative
time. Hover or focus a row for the exact local time; click it to jump to the
Releases page or open the task drawer. Dismiss a single row with **×**, or
**Mark all read** to clear the badge. Dismissed and read state is remembered
across reloads.

The bell also lists **Tasks needing you** below the notices — review
hand-offs, tasks flagged `needs input`, and branch drift (`needs merge`). A task
that is already `done` is never listed, even if it carries a stale flag left by
an earlier metadata-only state change.

### Close-out notices

A Move to done that **finishes**, **fails**, or **times out** records a durable
outcome on the server, so the notice is there even if you closed the tab while
the run happened — and it shows the same time on every client. Timeout is kept
separate from failure because the advice differs:

| Notice | Meaning |
| --- | --- |
| Move to done: #id landed | The merge landed on your primary branch. |
| Move to done: #id failed | A real gate failure; the task stays in `review`. |
| Move to done: #id timed out after Nm | The run passed `closeOut.timeoutMs`; a retryable failure. Retry, or raise the budget in Settings. |

A retry that later succeeds produces a new notice for the new run; it never
resurrects a notice you dismissed. **Stop MTD** produces no notice at all — a
cancel is not an outcome.

### Release notices

Release notes ready, release succeeded, and release failed appear in the same
feed and link to the Releases page.

## Notification settings

Settings → **Notifications** controls the bell sound and browser push. Both are
**off by default**, and every event type has its own toggle:

- Task attention — review ready, paused, stuck, needs attention.
- Releases — notes ready, release succeeded, release failed.
- Close-out — Move to done landed, failed, timed out.

A per-type toggle only suppresses the sound and push for that type; the bell
still shows the notice. Browser push needs the browser's permission and a
secure context (localhost or HTTPS on a real host) — see
[Troubleshooting](/troubleshooting) if it doesn't appear.
