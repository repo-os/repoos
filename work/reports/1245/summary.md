## TL;DR

A headless QA pass over the docs site and `user-docs/` at 375, 768 and 1280 px found and fixed three real defects: 39 broken internal links (now checked at every docs build), a code-block language label that was painted over by the copy button at every width (moved top-left), and nothing to fix in nav or search — sidebar, phone menu and local search worked at all three widths. The QA record landed as `docs/qa/2026-11-docs-site-nav-qa.md`, review passed first time with verdict `good to go`, and the task closed out cleanly in one dev round and one review round.

## Outcome

Shipped, on branch `feat/qa-pass-docs-site-and-user-docs-navigati`, merged as commit `250f657510fc91208300128bf291dc01397729d6`:

- **A build-time link checker** (`user-docs/scripts/check-links.ts`) that walks every rendered page in `.vitepress/dist` and resolves each internal `href`/`src` the way a browser would, including `#fragments` against the target page's ids. It runs as the last step of `bun run build`, so the existing `user-docs-build` gate in `repoos.toml` enforces it without editing that file (which the task forbade touching). It found 39 broken internal links out of 1,873: 20 changelog section links pointing at `#highlights` when the loader emits `#v0-5-92--highlights`, 16 links pointing at `../docs/…` paths that 404 on the published site, and 3 anchors drifted from their headings. All fixed; the check now reports 1,857 internal links resolving.
- **A code-block label fix** in `user-docs/.vitepress/theme/custom.css`: VitePress places the language label and copy button in the same corner, so they collided on every block at every width. The label now sits top-left in the padding above the first code line, verified against both the button and the code text.
- **A reusable layout-metrics module** (`user-docs/scripts/layout-metrics.ts`) shared by a browser test (`layout.test.ts`, 18 browser checks) and a QA sweep (`docs/qa/measure-docs-site-widths.mjs`) that covered 29 routes at 3 widths — 87 page loads, 471 code blocks — with no overflow, nav or search failures.
- **The QA record** `docs/qa/2026-11-docs-site-nav-qa.md`, as the acceptance criteria required.

Final verdict: **`good to go`** on review pass 1, followed by a successful close-out and `status done`.

## Process stats

| Item | Recorded value |
| --- | --- |
| Dev rounds | 1 (Round 1, 2026-11-19T21:00:36Z, Claude Code · haiku) |
| Review rounds | 1 (pass 1, verdict `good to go`) |
| Start → done wall-clock | 2026-11-19T20:07:43Z → 2026-11-19T21:27:43Z = 1 h 20 m 00 s |
| Close-out gate | 335 s |
| Engineer session | agent `engineer`, model `haiku`, 661 s, 119,998 tokens, $1.28770697 |
| Reviewer session | agent `reviewer`, model `opencode-go/glm-5.3-flash`, 95 s, 84,921 tokens, $0.02898693 |
| Routing session | model router (jev), model unknown, 0 s, tokens/cost not recorded |
| Token total (engineer + reviewer) | 204,919 |
| Cost total (engineer + reviewer) | $1.3166939 |
| Restarts/swaps | One orphaned engineer process (pid 95543) adopted twice; no model swaps recorded |

## What went wrong

- **Orphaned engineer process.** At 20:13:51 and again at 20:35:44 the log records "adopted orphaned engineer pid 95543". The engineer session itself finished normally (661 s, status `finished`); no further detail about the orphaning is recorded, and adoption resolved it both times.
- **Handoff-gate stall.** At 20:50:43 a CTO nudge held the task because the handoff gate was still running. It resolved on its own: UI verification passed at 21:00:36 (1 shot captured, clean console) and the task moved to `review` at 21:00:37.
- **A stale preview masquerading as a product bug.** The engineer rebuilt the docs while `vitepress preview` was serving the old hashed entry bundle, which then returned 404 — the client never hydrated and the phone menu button appeared dead. Restarting the preview on the new output fixed it; the sweep and tests now boot a fresh preview each run.
- **Engineer harness errors (four, all self-inflicted and fixed).** The home page title lives in the hero, not `.vp-doc h1`; the CLI page's h1 is "CLI reference", not "CLI"; route changes update the URL before the content (now waits on the h1 text); and clicks happened before hydration, plus a wait on a `.VPNavScreen.active` class VitePress doesn't set. All noted in the round report so the next pass doesn't repeat them.
- **First version of the overlap gate was too loose.** It counted boxes that only touched at a fractional pixel; the label was tightened and a strict gate kept.
- **Test-coverage gap (unresolved by design of the task).** `user-docs/scripts` (53 tests, including the 18 browser checks) is not picked up by the root vitest run, and `repoos.toml` was off-limits, so those tests sit outside `repoos check` alongside the pre-existing `worker.test.ts`. Wiring them in needs a human edit to `repoos.toml`; no linked task was recorded for it (see Follow-ups).
- **Scoped check step table oddity.** The scoped `repoos check --changed main` passed with no failed steps, but its step table listed `tests` as skipped for the remote validation runner while the run actually executed 784 test cases with none failing. Not a failure, but worth knowing when reading the table.

Explicitly **not verified** (recorded in the QA record): external links including the 16 new GitHub `blob/main` targets and the `#…-0761` anchor on `previews.md` (engineer sandbox had no network), dark and Gruvbox themes at these widths, a 768 px screenshot, and real devices/touch input.

## Learnings

Durable ones worth carrying into the repo's standing docs:

- **A link class the site generator skips is a silent gap.** VitePress was configured with `ignoreDeadLinks: [/^\.{1,2}\//]`, so relative links were never checked until the rendered-HTML checker landed. Candidate for `docs/agent-ui-and-preview-conventions.md` or the QA conventions doc: check rendered output, not source.
- **VitePress slugs are not heading text.** A leading digit becomes `_2-…`, apostrophes become `-`, and multi-word headings collapse with dashes; a loader that rewrites heading ids must also rewrite the header-anchor `href` or the permalink points nowhere. Link to the emitted id and let the build-time check catch drift.
- **A single 404 on the entry bundle makes the whole app inert** and looks exactly like a UI bug ("the button does nothing"). Check the network first. This generalizes beyond VitePress and belongs in `docs/agent-debugging-and-incidents.md`.
- **Two overlays in the same corner collide at every width**, and fixing one placement can move the collision onto content — gate the label against code text as well as against the button.
- **Preview servers must be restarted after a rebuild**; a stale hashed bundle silently serves old output. The tests now boot a fresh preview, which is the right pattern to reuse.
- **Process note for a future task:** if `user-docs/` tests should gate `repoos check`, that is a human edit to `repoos.toml`'s `[[check.steps]]` — file it as its own task rather than leaving it as a report footnote.

## Follow-ups

None — no linked tasks were recorded for this task. (The open item a reader might otherwise miss: wiring `user-docs/`'s 53 tests into `repoos check` requires a human edit to `repoos.toml` and currently has no task of its own; and the 16 new GitHub `blob/main` links plus the `#…-0761` anchor remain unverified until someone opens them online.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
