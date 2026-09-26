---
id: "0522"
title: Surface elapsed timer and queue ids in the minimised integration bar
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/surface-elapsed-timer-and-queue-ids-in-t
created_at: "2026-09-26T12:01:02Z"
updated_at: "2026-09-26T12:12:11Z"
---
## Problem

The integration status bar has two states, and the minimised one (the collapsed
strip) drops the two pieces of information that tell you whether the pipeline is
worth opening:

- **The elapsed timer is nearly invisible when minimised.** The expanded bar
  renders elapsed time as a pill — `background: var(--chip-bg)`, `border-radius:
  999px`, bold, `tabular-nums` (`.ibar-elapsed`). In the strip the same value is
  plain dim text mid-sentence (`· {{ elapsed }}`, `.strip-elapsed` supplies only
  `tabular-nums`), so it reads as incidental punctuation rather than a readout.
- **The minimised strip shows no queue at all.** Queued task ids exist only in
  the expanded bar's `.ibar-queue` row, so from the strip you cannot tell two
  closings are waiting behind the one in flight — the main reason to expand.

The expanded bar's queue row is also noisy for what it says: every entry repeats
the word "queueing…" (`#0455 queueing…`), and a trailing `+{{ queue.length }}`
count adds nothing the pills next to it don't already say.

## Desired UX

- **Minimised strip, while a task is integrating:** the elapsed time is styled
  exactly like the expanded bar's timer pill — same pill treatment, not a new
  style — so the number reads at a glance from across the screen. It stays
  visually part of the line, not a separate trailing crumb.
- **Minimised strip, queue:** a `Queue:` segment listing the queued task ids as
  pills, e.g. `Queue: #0455 #0456`. It appears only when something is actually
  queued and sits after the active-task line, so the strip reads roughly
  `● #0455 integrating… check  3m 07s  Queue: #0456 #0457`.
- **Expanded bar, queue:** less verbose — `Queue:` followed by one pill per
  queued task id, nothing more. The per-entry `queueing…` wording and the
  trailing `+N` count are gone; the ids alone convey what the row already says.
- **Both states** use the same pill treatment for the timer and for each task id,
  so the two views read as one component.
- Idle and failed states are unchanged: no timer, no queue, same copy.

## Acceptance criteria

- [ ] With a task integrating and the bar **minimised**, the elapsed timer renders
      with the same pill treatment as the expanded bar's `.ibar-elapsed`
      (rounded/`--chip-bg` chip), not as bare dim text.
- [ ] With queued tasks and the bar **minimised**, the strip shows a `Queue:`
      label followed by one pill per queued task id, in FIFO order — e.g.
      `Queue: #0455 #0456`.
- [ ] With an empty queue and the bar minimised, no `Queue:` segment is rendered.
- [ ] In the **expanded** bar the queue row renders `Queue:` + one id-pill per
      queued task; the per-entry `queueing…` text is gone.
- [ ] The trailing `+{{ queue.length }}` queue count is no longer rendered in the
      expanded bar.
- [ ] Timer and task-id pills share one styling in both states (same background,
      radius and type treatment); queue ids keep the mono/tabular treatment so
      they line up.
- [ ] The strip still fits on one line and still ellipsises rather than
      overflowing, including with a non-trivial queue and at mobile widths
      (`max-width: 760px`).
- [ ] The strip's existing `title` tooltip still summarises the active task, and
      the queue ids remain readable by assistive tech.
- [ ] Idle, failed, stage hover/focus pane, stage click-to-Debug, collapse/expand
      and auto-collapse behavior are unchanged.
- [ ] `src/ui-app/tests/integration-status-bar.test.ts` is extended to cover the
      minimised queue segment and the pill treatment (update rather than weaken
      the existing assertions).
- [ ] `bun run build:ui` run after the change; `repoos check` passes; no console
      errors.

## Notes for AI

- Everything here lives in one file:
  `src/ui-app/src/components/IntegrationStatusBar.vue`. Relevant markup: the
  collapsed strip `button.ibar-strip` (`.strip-label` currently renders
      `#id … stage · {{ elapsed }}` via `.strip-elapsed`), and the expanded
  queue row `.ibar-queue` (`.queue-label` + `.queue-item` + `.queue-count`).
- The strip is a single `<button>` (clicking it expands the bar). Keep the queue
  segment **non-interactive** inside it — no nested `<button>`/anchor. Nothing in
  the request makes the queue pills clickable, so don't add a drawer-opening
  affordance; if you want hover behaviour, use the element's `title`.
- The timer pill styling to reuse is `.ibar-elapsed` (`--chip-bg`,
  `border-radius: 999px`, `padding: 1px 8px`, `font-weight: 600`,
  `font-variant-numeric: tabular-nums`). Extract that into a shared class and use
  it from both states rather than copying the declarations — the point of the
  request is that the two views look the same. `.queue-item` is already a pill in
  the same spirit; the queue ids should end up indistinguishable in style from
  the timer pill apart from the mono font.
- Assumption: "less verbose" for the expanded row means dropping the repeated
  `queueing…` wording and the redundant `+N` count, not reformatting or
  reordering anything. Keep the `Queue` label in place, in its own row.
- Assumption: pills, not buttons. Don't give the pills hover/border states that
  imply clickability.
- Assumption: the minimised queue shows the **queued** task ids only. The task
  being integrated is already shown by its own id in the strip's summary — the
  user's example (`#0455 #0456`) reads as the two waiting tasks, not "the active
  one plus the first queued one".
- If the strip's content is getting wide, prefer keeping the ellipsis behaviour
  already on `.strip-label` (and consider the same treatment for the queue
  segment) over letting the strip's width grow unbounded — the desktop
  `max-width: min(680px, …)` cap is what #0224 set up.
- The desktop strip is already a floating rounded pill
  (`border-radius: 999px` at `min-width: 761px`) — keep it looking like one chip,
  don't let inner pills fight that silhouette.
- `WorkView.vue` reserves space for the bar via `.ibar-spacer`; no change needed
  there, but check the strip's height doesn't grow enough to leave a visible gap
  once queue pills are in it.
- Rebuild the UI (`bun run build:ui`) after the change so the worktree build is
  fresh. No need to request a preview.

## Scope

Covers the collapsed strip's timer and queue rendering, and the expanded bar's
queue row verbosity. Deferred: the stage row, the stage hover pane (#0460/#0465),
the failure/error box, the idle copy, and any change to what data
`IntegrationPipelineSnapshot.queue` carries.

## Related

- #0460 — introduced the stage hover pane
- #0465 — widened that pane
- #0224 — floated the integration bar as a rounded panel on desktop

## Original prompt

I want to fix the UI of the integration status thing, here's what to do:
- in the minimised view make the timer more obvious, similar to how it looks in the expanded view (is it a pill?)
- in the minimised view also show the queued task numbers, like "Queue: #0455 #0456"
- in the expanded view be less verbose with the queue, just: "Queue:  #0455 #0456"

queue numbers and timer as pills/buttons whatever that styling is

## Screenshots

![Screenshot-2026-09-26-at-19.52.38](/api/tasks/0522/attachments/screenshot-1.png)
![Screenshot-2026-09-26-at-19.52.47](/api/tasks/0522/attachments/screenshot-2.png)

## Activity

- 2026-09-26T12:01:02Z · created · hello@repoos.org
- 2026-09-26T12:01:03Z · screenshots
- 2026-09-26T12:01:03Z · screenshots
- 2026-09-26T12:01:44Z · status draft→inbox, title, area, body
- 2026-09-26T12:02:29Z · status inbox→ready
- 2026-09-26T12:12:11Z · status ready→active, branch
