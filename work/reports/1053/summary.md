## TL;DR

Done now starts collapsed for browsers without a saved preference and mounts no cards while collapsed. When expanded, it keeps at most 40 cards mounted and reveals older tasks as you scroll. Final verdict: **good to go**.

## Outcome

Shipped the lazy Done column, per-browser collapse preference, and configurable default in General settings. Search and task data remain available across the full board. The benchmark showed large reductions in mounted cards, DOM nodes, and heap in its synthetic fixture. Scroll-to-end time increased, and the measurements do not establish that server-side pagination is worthwhile, so the 2.6 MB payload remains unchanged.

Before/after measurements used a fresh headless Chromium context, a 1440×900 viewport, and 1,000 synthetic Done tasks; each figure is the median of three runs. Board paint was measured at the first animation frame after the Done column appeared. “Readiness proxy” was navigation plus two frames, not direct input latency. Heap came from rounded `performance.memory`, and scroll time measured setting scroll position to the end plus two frames.

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Board paint | 2,424 ms | 1,160 ms | -52.1% |
| Readiness proxy | 3,144 ms | 1,387 ms | -55.9% |
| Done cards at load | 1,000 | 0 | -100% |
| Board DOM descendants | 17,053 | 53 | -99.7% |
| JS heap after load | 139 MB | 13.4 MB | -90.4% |
| Expand Done | 799 ms | 565 ms | -29.3% |
| Scroll to end | 202 ms | 259 ms | +28.2% |

The benchmark was synthetic and had no network or CPU throttling. It did not measure real payload transfer.

## Process stats

- Engineering rounds: 1 recorded round. Review passes: 1.
- Task created at 2026-11-07T08:04:58Z and marked done at 2026-11-07T14:48:06Z. Wall-clock from creation to done: 6 hours, 43 minutes, 8 seconds.
- Engineer: gpt-6.1-terra. Reviewer: haiku. Routing session: typesafe/jev-1.14-20261014. Restarts or swaps: not recorded.
- Engineer session: 65,018,555 tokens; cost not recorded. Reviewer session: 9,431 tokens, cost 0.3127992. Routing session: 4,429 tokens; cost not recorded.
- Close-out gate completed in 245 seconds.

## What went wrong

- The first engineering turn ended without handoff because the implementation and required measurements were incomplete. A later turn collected a preliminary baseline, then the final round replaced it with the stated comparison.
- The first handoff failed because the browser capture timed out. The task later moved to review, and the review verdict was good to go.
- A later handoff failed because reused check inputs had changed; the check needed to be run again. Close-out subsequently completed successfully.
- An engineer process was adopted after becoming orphaned. Another engineering turn ended without handoff amid missing custom tool output errors; the task later proceeded through review.
- The measured scroll-to-end time worsened by 28.2%; the report identifies this measurement as short and noisy.

## Learnings

- In this fixture, avoiding card mounts while collapsed and bounding the expanded window substantially reduced rendering work. The scroll time result and synthetic conditions limit what can be concluded about real user experience.
- The scrollbar estimates unseen card heights until measurements arrive. Consider this when assessing further virtualization changes.
- Keep performance conclusions and repeatable measurement methods in the task report; real-network measurements would be needed to judge payload trimming.

## Follow-ups

None recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
