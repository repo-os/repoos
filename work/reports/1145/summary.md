## TL;DR

Task 1145 fixed four phone-width UI problems in the RepoOS web UI: nonessential page subtitles are hidden below 720px, the REPOOS / WORK breadcrumb and idle integration bar no longer appear on the mobile Work queue, page titles (Mission Control and the task drawer) now align to the left content edge, and the More bottom sheet switched from the translucent `--panel` token to the opaque `--panel-solid` surface in every theme and both color modes. One engineer round (one crash, auto-recovered) and one review pass ("good to go" with an evidence gap noted) landed the work; the close-out pipeline merged it successfully.

## Outcome

Shipped on branch `feat/mobile-web-reduce-page-clutter-and-fix-m`, merged as commit `cb308838019707459456eb0048afcdc10b1ed49a`:

- **Hidden explanatory subtitles on phones** — a single phone-width rule in `style.css` hides the shared `.page-desc` plus the page-local subtitle classes (`.rel-sub`, `.ck-sub`, `.dep-sub`). One deliberate exception: `.page-desc:has(.save-msg.err)` stays visible in Settings and Agents, since those views surface config save failures inline and hiding them would remove needed status.
- **Work queue cleanup** — the `REPOOS / WORK` breadcrumb `<p>` was deleted outright from `MobileWorkQueue.vue` (mobile-only component, so no desktop impact).
- **Idle integration bar hidden on phones** — `IntegrationStatusBar.vue` now applies `is-idle` only when the snapshot is idle and the check plan needs no attention; a phone-only rule hides `.ibar-wrap.is-idle`. Active, failed, stalled and queued states stay visible, and an empty check plan is treated as actionable (visible, with an amber "No checks configured — open for details" strip).
- **Title alignment** — Mission Control's inline `align-items: flex-end` on the page header was removed (it duplicated base rules and was defeating the 720px media query). The task drawer's mobile header was restructured via a `task-detail-head` hook so the back button and close control take the first row and the title gets a full-width second row; its inline `flex: 1` moved into base CSS, leaving desktop unchanged.
- **More sheet opacity** — the sheet now uses `--panel-solid`, which every supported theme defines as opaque, fixing text bleed-through in all themes and both light and dark modes without a backdrop-filter.
- **Stories header fix (follow-on)** — the checkbox + 210px sort select now live in a named class that wraps on narrow screens.
- **Tests** — new focused regression coverage in `src/ui-app/tests/mobile-clutter.test.ts` (155 lines).

Final verdict: **good to go** (review pass 1), with one evidence gap noted — no handoff capture showed the fixed task-detail title. All declared UI shots captured cleanly (3 of 3) and the automated checks passed. Status: done, release: success.

## Process stats

- **Timeline:** created 2026-11-17T02:52:23Z → done 2026-11-17T04:09:33Z (77 minutes wall-clock). Ready→active at 02:53:34Z; review entered at 03:30:30Z; close-out gate ran 527s; release at 04:09:33Z.
- **Rounds:** 1 engineering round, 1 review pass. No restarts of the task itself.
- **Agents and models** (from recorded session rows):
  - Engineer: `opencode` · `opencode-go/deepseek-v4.1-flash` — 2000s elapsed, 328,309 tokens, $0.1201984079999999. Status: finished *with an error exit* (crash-recovered; see below).
  - Reviewer: `opencode-go/deepseek-v4.1-flash` — 313s elapsed, 101,527 tokens, $0.03581500800000001.
  - Debugger: `opencode-go/deepseek-v4.1-flash` — 17s, tokens/cost not recorded.
  - Routing (model router, openrouter): 2 sessions, 0–1s each, model not recorded, no tokens/cost.
- **Crash/swap count:** 1 engineer crash, auto-recovered (crash recovery counter read "1/3 crashes in 30m"); no model swaps.
- **Totals** (sum of recorded session rows): 429,836 tokens, $0.15601341599999991. Debugger and routing sessions are not included in these sums where the facts are silent.

## What went wrong

- **Engineer crash (03:01:13Z).** The first engineer run ended with "the agent process exited with an error." Crash recovery kicked in automatically and resumed the same agent/model pair (`opencode` + `opencode-go/deepseek-v4.1-flash`) as recovery 1 of 3 within a 30-minute window. The resumed run completed the work; no manual intervention was recorded and the underlying cause of the exit was not captured in the facts available here.
- **First `repoos check` run failed on formatting** in the new test file. Resolved by running `bun run fmt`; the rerun passed every step. This matches the standing rule that format/lint failures are fixed with `--fix`/`fmt` before anything else.
- **CTO nudge at 03:27:42Z** — the task was briefly held while the handoff gate was running. It self-resolved: the gate finished, UI verification reported 3 of 3 shots captured with a clean console, and the task moved to review at 03:30:30Z.
- **Review evidence gap.** Pass 1's verdict was "good to go — EVIDENCE-GAP-ONLY": no declared shot showed the fixed task-detail title (the only acceptance-criterion fix with no handoff capture). The reviewer verified that fix via the diff instead and found no bugs. This was accepted as-is rather than blocking the merge; the light-mode More sheet was similarly covered by tests and the contrast audit rather than a capture.

## Learnings

- **Inline styles on shared layout classes silently defeat responsive media queries.** Mission Control's misaligned title looked like a flex bug but was an override-order bug: an inline `align-items: flex-end` outranked the existing 720px `.page-header` rule. Worth a line in `docs/agent-ui-and-preview-conventions.md` under the responsive-layout conventions: don't put layout properties inline on classes that media queries restyle.
- **Theme tokens carry intent.** `--panel` means a translucent glass surface and must never be used for a modal sheet over unbounded page content; `--panel-solid` is the opaque counterpart. This is a durable convention for `docs/agent-ui-and-preview-conventions.md` (and applies to any future overlay/sheet work).
- **"Hide idle chrome" needs a precise definition of idle.** An empty check plan is an attention state, not idle — the hide rule must exclude it rather than key only on the snapshot's `empty` flag. Also, a *broken* (erroring, not empty) check plan doesn't set `planEmpty`, so it still shows the idle label on phones — pre-existing behavior, not a regression, but a candidate follow-up if that mislabel matters.
- **Deliberate status-preservation exception:** when hiding subtitles, keep inline error surfaces (`.save-msg.err`) visible even inside otherwise-hidden description blocks. Saving a transient "Saved — applied live" line is fine; hiding a failure is not.

## Follow-ups

None recorded. (The reviewer's suggestions — adding a task-detail capture and a light-mode More-sheet capture — were recorded as shot improvements, not filed as linked tasks; no linked tasks exist for this task.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
