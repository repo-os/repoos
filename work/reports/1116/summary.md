---
id: summary
title: summary
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: ""
---
## TL;DR

#1116 closed the remaining cross-surface mobile touch gaps after the #1112–#1115 shell/queue/details/Settings slices: below 720 px, page content and the integration status bar now use the full viewport width (floating agent heads overlay content instead of reserving a ~70 px inline-end column), floating-head visibility became a per-device Settings preference (default off on phones, on on desktop; CTO/Ross/Debugger stay reachable from the More sheet), Releases and Activity gained stacked actions, 44 px touch targets and wrap-anywhere text, and #1069's last-activity touch gestures were verified rather than reopened. Review pass 1 found a drawer-stacking bug (fixed in-branch); pass 2 was good to go. Getting there required swapping a crash-looping pinned codex + gpt-6-luna engineer override to composer-2.5 and fixing a WebKit page-height gate failure on the feature branch. Merged as `ef69819c6b0eb65ebf6ad595e13f707bfd56b4cf`.

## Outcome

What shipped:

- **Full-width narrow layout:** on viewports below the 720 px breakpoint, `--page-inline-end-inset` is set to 0 on `#app`, `.main` uses flat 16 px end padding, and `.ibar-wrap` sits at `right: 12px`, so the three floating heads (Ross, CTO, Debugger) no longer reserve their own column on phones; they float over content, with bottom clearance still handled by `--page-bottom-inset`. The integration status bar's media queries were aligned from 760 px to the shared 719.98 px breakpoint.
- **Per-device floating-heads preference:** a new `useFloatingHeadsPreference` composable reads `repoos-floating-heads-visible` from localStorage (not `repoos.toml`); unset defaults to hidden on narrow screens and visible on desktop. A Settings switch under Themes (`data-test-id="floating-heads-setting"`, shared Switch component) controls it, and when heads are hidden the More sheet lists Open CTO / Open Ross / Open Debugger as full-width touch rows, launching via window events into the still-mounted panels. All open paths close the mobile task drawer first (the pass-1 fix).
- **Releases and Activity readability:** a narrow media block stacks header actions, enforces ~44 px minimum touch targets on links and primary buttons, and applies `overflow-wrap: anywhere` to meta/blocker text; the Activity feed got matching wrap rules, covering configured and empty states.
- **#1069 touch behavior:** the last-activity trigger's tap, long-press and `pointercancel` handling was confirmed working in the mobile composition; not reopened, no global tooltip hosts changed.
- **Tests:** new focused coverage (`mobile-touch-affordances.test.ts`), additions to `mobile-layout.test.ts`, and updates to the page-height browser/layout tests so narrow viewports expect heads and the integration bar to overlap horizontally without clipping past the viewport.

Final verdict: review pass 2 returned **good to go** (qualified `STALE-EVIDENCE-ONLY` / `EVIDENCE-GAP-ONLY` on shot recency, see below); status is done with `release:success`.

## Process stats

- **Rounds:** 1 recorded engineering round (Round 1, preceded by earlier engineer turns that ended in crashes and left WIP checkpoint commits); 2 review passes (needs some work → good to go).
- **Wall-clock, start to done:** created 2026-11-14T09:11:01Z, done 2026-11-14T18:47:18Z — 9 h 36 m end to end. Engineering was active only from 16:14:12Z (ready→active) to done, i.e. 2 h 33 m; the task sat in needs_input/ready between 09:11 and 16:03.
- **Agents and models per role:**
- Engineer: a human-set override (16:03:44) pinned the engineer; crash-recovery notes identify the pinned pair as codex + gpt-6-luna. A second override (17:03:58) switched the engineer to composer-2.5, which finished. Sessions table: composer-2.5 finished, 4989 s elapsed, 13,111,829 tokens; gpt-6-luna errored, 659 s, 13,110,829 tokens (both listed with start 2026-11-14T16:14:15Z).
- Reviewer: composer-2.5, two sessions (41 s and 56 s).
- Debugger: deepinfra/deepseek-ai/DeepSeek-V4.1-Flash, five sessions, all errored; no successful debugger session recorded.
- Routing: OpenRouter model router (model unknown), two 1 s sessions.
- **Tokens/cost:** recorded engineer tokens total 26,222,658 across the two sessions (13,111,829 + 13,110,829). Reviewer, debugger and routing tokens not recorded. Cost: not recorded for any session.
- **Restarts/swaps:** 3 watchdog engineer restarts (two after queued messages waited 3 m with no live process, one after 10 m with no live process); 5 crash-recovery events on the codex engineer; 2 adoptions of an orphaned engineer process (pid 34168); 1 engineer model swap via override.

## What went wrong

- **Handoff gate failure (16:39:03):** remote validation failed — `tests/page-height-browser.test.ts` (WebKit) "keeps pipeline controls outside the head stack" at 320 px, 390 px and 760 px on bee. Resolved by fixing in the feature branch and re-running; later review passes report state ok and the close-out gate ultimately completed.
- **Codex engineer crash loop (16:48:44–17:02:13):** five agent exits in ~14 minutes, with "failed to record rollout items: thread … not found" and repeated "Reading additional input from stdin..." errors. Crash recovery auto-resumed twice, then correctly *surfaced instead of switching* because the override was human-pinned; watchdog restarts could not break the loop. Resolved only when the override was changed at 17:03:58; the composer-2.5 engineer then completed the work.
- **Debugger unusable:** all five debugger sessions errored immediately — DeepSeek-V4.1-Flash on deepinfra returned "You need positive balance to do inference." The record shows no recovery beyond the task proceeding without debugger sessions.
- **Stalled message delivery:** queued messages waited undelivered twice (watchdog restarts at 16:42 and 16:51), and at 17:38:38 the turn was ended so a 3-minute-undelivered message could reach an unresponsive engineer (delivered 17:42:39). Five CTO nudges were held during gates/validation; one completion reminder was sent at 17:35:28.
- **Review findings:** pass 1 flagged a real bug — More-sheet launches of CTO/Ross left the mobile task drawer stacked under the agent panel (Debugger already closed it). Fixed via a shared `openHead` path that calls `ui.close()` for all launch events, plus `agentEnabled` gating for More-sheet shortcuts.
- **Shot evidence gaps:** the second review's browser capture was cancelled ("shots: failed — browser capture cancelled", 18:05:27); pass 2 reviewed with all three captured PNGs stale (tree `f438ad4f` vs reviewed HEAD `43cf4fd`) and the fourth declared shot (task drawer + More → CTO) never taken, accepting the gap as evidence-only. Earlier, pass-1 evidence was also one tree behind (bookkeeping-only diff).

## Learnings

- **Don't reserve inline space for `position: fixed` controls that already float.** On ~390 px viewports a ~70 px reservation is expensive; overlay the fixed stack and keep only bottom clearance via the existing `--page-bottom-inset`. Worth a line in `docs/agent-ui-and-preview-conventions.md` alongside the existing `--page-bottom-inset` rule.
- **Per-device UI preferences belong in localStorage with composition-aware defaults,** not `repoos.toml` — especially when desktop and phone users legitimately want different defaults. This matches the task body's requirement; the localStorage-key pattern (`repoos-floating-heads-visible`) is a good reference example for future per-device settings.
- **A human-pinned agent override turns crash recovery into surfacing-only — by design.** That is the correct fail-safe (RepoOS must not silently replace a human's choice), but it means a pinned override that crash-loops stalls the task until the human swaps it; watchdog restarts alone cannot help. The existing 5-crash surfacing worked; a note in `docs/agent-workflow-rules.md` about pinned overrides stalling under crash loops would make the expected resolution path explicit.
- **Layout regression tests can stay static** (source/CSS assertions for insets and More-sheet wiring) with browser tests reserved for overlap/overflow behavior — cheaper and non-flaky, as used here.

## Follow-ups

none (the linked tasks #1112, #1114 and #1115 are prerequisites this task depended on, not new tasks filed from issues met here; pass 2's note that `toggle()` on the floating-head buttons opens panels without closing the drawer — pre-existing, out of scope — was not filed as a task).

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
