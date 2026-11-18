# Releases cut flow QA — 2026-11-19

## Result

The cut flow remained usable at 1280 × 900 and 375 × 812 across the notes chooser, a blocked working tree, a running check, a failed check, and a successful release. No horizontal overflow or uncaught page errors appeared. At phone width, long drawer content scrolls while the Publish/Cancel footer remains inside the viewport. I found no product defect to fix.

All `/api/release*` requests were intercepted by Playwright with synthetic state. The browser run asserted **zero POSTs to `/api/release`**; it did not publish, push, tag, generate real AI notes, or invoke the Debugger. No visible browser was opened.

## Method

I used a detached scratch worktree at `.repoos/qa-scratch-1206` and started its auth-less server with `just serve-noauth 7286`. The Playwright script is `docs/qa/measure-releases-cut-flow.mjs`; it can be rerun from the task worktree with:

```sh
QA_BASE_URL=http://127.0.0.1:7286 bun docs/qa/measure-releases-cut-flow.mjs
```

The script uses headless Chromium and synthetic responses for release status, run state, distribution, email, notes, and auto-publish. It opens the cut panel through `/releases?drawer=cut`, inspects the chooser without confirming note generation, and injects blocked, running, failed, and succeeded run snapshots. Captures are stored under the ignored `.repoos/qa-releases-cut-flow/` directory.

## Findings

| State | 1280 × 900 | 375 × 812 |
| --- | --- | --- |
| Notes chooser | Both choices and the Generate notes action fit in the dialog. | Both choices and the action remain visible; the rest of the panel is dimmed behind it. |
| Blocked | The dirty-tree reason is visible and the page-level cut action is disabled. | Same; the message wraps without widening the viewport. |
| Running | “Step 4 of 7 · Running checks” and recent output are visible. | Progress stays in the drawer; the footer remains in view. |
| Failed | The phase summary, tl;dr, failed test, output, and Debugger action are legible. | Details scroll inside the drawer while Publish/Cancel stay pinned at the bottom. |
| Done | The success outcome and updated version appear on the Releases page. | The success outcome fits above the bottom navigation. |

The browser script also checks for horizontal overflow, missing chooser options, failure/success copy, disabled cut entry under blockers, action-footer bounds, and uncaught page errors at both widths. Page errors are collected and now explicitly fail the scenario with its state and viewport. All ten state/viewport combinations passed. The observed release POST count was zero.

Review round 1 identified that the collected page errors were not yet an assertion. The harness now throws with the scenario name, viewport, and error messages if any uncaught error occurs; I reran the entire matrix after that change and all ten cases passed.

## Verification

- `bun docs/qa/measure-releases-cut-flow.mjs` — passed all ten state/viewport combinations; zero intercepted release POSTs.
- `bun run build` — completed as part of `just serve-noauth` from the scratch worktree.
- `REPOOS_CHECK_CHANGED=main repoos check` — passed. The check classified this as a docs/bookkeeping-only diff, so unrelated build, lint, test, and UI smoke steps were skipped; formatting, branch artifact, task asset, and task parser checks passed.

## Evidence

The screenshots are transient local artifacts under `.repoos/qa-releases-cut-flow/` and are intentionally not tracked. The QA script and this written matrix preserve the reproducible checks and result.
