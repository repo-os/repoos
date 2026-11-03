# Idle board renderer cost (#1018)

Measured 2026-11-04 in the #1018 worktree with Playwright Chromium 1248
(CDP `Performance.getMetrics`) against the built UI and a generated fixture
repo with hundreds of tasks. This records the reproduction, the causes found,
the fixes, and the regression tests that keep them fixed.

## What was reported

A Chrome PWA pointed at `http://127.0.0.1:7171` had been open for ~1.5 days.
Its renderer process held 29–97% of one CPU and its GPU process another
30–66%, at ~640 MB. Host load reached 36–69, the server stopped answering, and
`launchd` restarted it seven times. Killing the renderer and GPU processes
dropped load to ~6.5.

A PWA is the same web app in a standalone window: it uses the same renderer,
the same Vue components and the same event stream. Nothing in the UI branches
on display mode, so the cost is not PWA-specific — an ordinary tab left open
has it too. The PWA was simply the place it was noticed (and a window left
visible keeps CSS animations running, unlike a minimized tab that Chrome
throttles).

## Method

A temporary Playwright/CDP harness generated the fixture and sampled the
built app. The documented method is reproducible from this description:

1. Generate a fixture repo under a temp dir with N hundreds of task files in
   realistic statuses (62% done, plus draft/inbox/ready/review), a minimal
   `repoos.toml`, and no live agents.
2. Boot the built app with the check gate's own harness
   (`startPreviewServer`, port 0, auth disabled).
3. Open `/work` (or `/`) in headless Chromium with a fresh profile, wait for
   the board and its cards, then sample CDP `TaskDuration`/`ScriptDuration`,
   DOM mutations (MutationObserver), rAF callbacks, `setInterval` callback
   counts, SSE event types, fetch counts, JS heap and node count.
4. Run the same fixture before and after the fixes.

Headless Chromium keeps a page `visible` even when another page is brought to
the front, so the hidden-tab numbers below come from the deterministic unit
tests (fake timers + a stubbed `visibilityState`), not from this harness.
Chrome also throttles timers in a genuinely hidden tab; the point of the fix
is that RepoOS no longer *has* per-card work to throttle in the first place.

## Measurements

Before the fixes (same harness, 200–300 cards, idle, no agents):

| Fixture | Window | Main thread | DOM mutations | 15 s interval callbacks | Heap |
| --- | ---: | ---: | ---: | ---: | ---: |
| 300 cards | 20 s | 10.1% of one core (26% during a settling run) | 15.5/s | 284 (≈14/s) | 53–127 MB |
| 200 cards | 12 s | 7.0–9.2% | 3.7–9.2/s | 190 | ~57 MB |

After the fixes:

| Fixture | Window | Main thread | DOM mutations | Heap |
| --- | ---: | ---: | ---: | ---: |
| 0 cards | 20 s | 0.8% | 0 | 7 MB |
| 470 cards (`/work`) | 40 s | 1.6% flat | 0 | 58 MB |
| 470 cards (`/work`) | 8 s post-mount | ~5% (mount still settling) | 0 | 97 MB |

The 40-second run's cumulative `TaskDuration` samples rose by 0.01–0.14 s per
5-second sample, i.e. ~0.2–2.8% in any given interval, with no upward drift.
The old 15-second timer count (≈14 callbacks/s for 200 cards) is gone; after
the fix only the shared one-second clock remains.

## Causes found

1. **One `setInterval` per `TaskCard`.** Every card started a 15-second timer
   to refresh a `now` ref used only for live state (stuck-agent staleness,
   close-out/queue countdowns). All cards mounted together, so the timers
   fired in one tick: 200 cards produced ~190 full card re-renders in a
   12-second window, and hundreds of timers ran forever on an idle board.
2. **Per-card clock subscriptions.** Each card's `held` computed read the
   shared one-second clock unconditionally, so cards without a hold
   re-evaluated that computed every second. The store's `heldTasks` did the
   same over the whole task list.
3. **`byStatus()` filtered and sorted the whole task list on every call.**
   `BoardColumn` calls it twice per render (list + empty check) for every
   column, and `taskCount` calls it again. At hundreds of tasks, each repaint
   paid thousands of comparisons; the "recent" sort for the done column also
   parsed every task body per comparison.
4. **O(n) transcript writes.** Every streamed `agent.output` line rebuilt the
   whole `outputs` record and copied up to 2000 entries. Long agent runs (and
   the reviewer/CTO buffers) therefore did O(n) work per line and invalidated
   every component reading any transcript on each line.
5. **Unbounded check/test-run logs.** `task-check.output` appended to a
   string with no cap, `task-check.started` appended runs with no cap, and
   `test-run.output` had no cap. Days of checks grew the tab's heap without
   bound — consistent with the reported 640 MB.
6. **Fixed-interval SSE reconnect.** The server told every client
   `retry: 2000`; EventSource then reconnected every tab in lockstep after a
   restart, and each reconnect pulled the full board index. That is a
   reconnect storm precisely when the server is least able to take one.
7. **Polling and animations ignored visibility.** Card remote-check polling
   (5 s per running card), ChecksView (3 s/5 s), RemoteRunnersPanel (3 s) and
   reminder polling kept running while hidden; card pulse/glow animations kept
   compositing on a visible PWA window.

## Fixes

- `TaskCard` gets a timer only when its state genuinely changes with time
  (running process, integration pipeline, queued, handoff/done-error retry,
  checkpoint recovery). Idle cards have no timer. Timers stop while the
  document is hidden and resync on return.
- `useNow` is one shared, visibility-aware clock: it stops while hidden,
  advances once on return, and its consumers short-circuit before reading it
  when they have no hold.
- `byStatus` is backed by a computed per-status cache keyed on tasks + sort
  order, so template reads are O(1).
- Transcript appends are in place (push + trim); check runs are capped at 25
  per task, a single check output at 400 KB, and the test-suite output at
  500 KB.
- The board's SSE client owns reconnection: exponential backoff from 1 s to
  30 s with full jitter, reset on a real open. The server's `retry:` hint is
  jittered 1–3 s per connection for other EventSource consumers.
- App.vue toggles `ui-document-hidden` on `<html>`; `style.css` pauses all
  animations/transitions while it is set. Pollers skip their request while
  hidden. `system.stats` is not applied to the store while hidden.

## Regression checks

- `src/ui-app/tests/idle-board-budget.test.ts` — twenty idle cards add no
  per-card timers; a simulated idle minute produces effectively zero DOM
  mutations; a live card keeps its timer and loses it while hidden; `byStatus`
  is memoised.
- `src/ui-app/tests/store-growth.test.ts` — transcript/check/test-run/feed
  buffers are capped and transcript appends keep the record identity.
- `src/ui-app/tests/sse-backoff.test.ts` — exponential cap and full-jitter
  bounds.
- `src/ui-app/tests/sse-idle-rate.test.ts` — one idle client gets a jittered
  retry hint and no per-second task/attention event stream.

## Related

`docs/activity-animation-performance-0956.md` measured the activity-indicator
animation coordinator (at most six animations, paused when offscreen/hidden).
This work is complementary: it bounds the timers and store writes around
those indicators rather than changing the animations themselves.
