## TL;DR

QA audit of shared strings, tooltips and empty labels across the Hub macOS and web UIs. The real defect was narrower than the task feared: the global web tooltip helper (`src/ui-app/src/lib/tooltip.ts`) removes a control's `title` on first hover/focus, so icon-only controls named only by `title` lost their accessible name after the first interaction. Five such controls across four components received explicit `aria-label`s, one inconsistent tooltip phrase was unified, the macOS Hub was verified as already correctly labeled, and a template-wide guard test (`icon-control-names.test.ts`) now ratchets the class shut. The committed audit lives at `docs/qa/2026-11-labels-tooltips-audit-qa.md`. It took 3 dev rounds and 3 review passes: reviews 1 and 2 each found a false-negative bug in the guard's regex scanning (same root class, quote-blind tag matching), fixed in rounds 2 and 3. Review pass 3 returned `good to go` and the task landed as merged commit `af199781bc14a95c1ce2df9e6c80eb31778b1791`.

## Outcome

- **What shipped:** `aria-label` added to five icon-only controls that relied solely on `title` (IntegrationStatusBar pipeline collapse toggle, AgentCard instructions toggle, two AgentModelModal favorite stars, DiffView prev/next-file arrows); the drawer's diff button wording unified to "Open full-screen diff"; a new guard test `src/ui-app/tests/icon-control-names.test.ts` (18 cases) that fails if any button/link under `src/ui-app/src` lacks a visible text or name attribute, plus a quote-aware tag scanner hardened after two review findings; the audit document `docs/qa/2026-11-labels-tooltips-audit-qa.md`, covering the web findings, the macOS Hub check (its icon-only controls pair `.help()` with `.accessibilityLabel()` in `HubSidebarControls.swift`, so native `.help()` is appropriate there), and documented-not-changed wording decisions (remove/delete/dismiss verbs) left for a product call. `repoos.toml` was not touched, per the task note.
- **Final verdict:** review pass 3 on 2026-11-19T22:26:00Z returned `good to go`; close-out completed and the task moved to done with release success on 2026-11-19T22:51:46Z.

## Process stats

- **Dev rounds:** 3 (all by the same engineer agent, no restarts or swaps).
- **Review passes:** 3 — pass 1 `needs some work`, pass 2 `needs some work`, pass 3 `good to go`.
- **Wall-clock, start to done:** 64 min 41 s (created 2026-11-19T21:47:05Z → done 2026-11-19T22:51:46Z).
- **Agents and models:** engineer — Claude Code running `haiku`, one session (elapsed 1672 s). Reviewer — OpenCode running `opencode-go/glm-5.3-flash`, three sessions (43 s, 66 s, 100 s). Plus three "Model router (jev)" routing sessions, model unknown, 0 s elapsed, no tokens recorded. No agent restarts or model swaps occurred.
- **Tokens:** engineer 40,152; reviewers 41,171 + 37,006 + 33,819 = 111,996; total recorded 152,148.
- **Cost:** engineer $0.4869687; reviewers $0.01797978 + $0.0123783 + $0.00994357 = $0.04030165; total $0.52727035.
- **Gates:** scoped checks passed each round (tests step skipped locally, `REPOOS_SKIP_TESTS=1`; the remote runner runs the suite). Close-out gate completed in 659 s.

## What went wrong

- **Guard false negative, round 1 (review pass 1):** the guard test's open-tag regex `<(button|a)\b([^>]*)>` stopped at the first `>`, so an attribute value containing `>` (e.g. `:disabled="i > 0"` in `LoginView.vue`) made an unnamed control look named. A blanket `v-bind=` exemption also skipped any bound control. Fixed in round 2 by making the open-tag match quote-aware and removing the exemption, with fixtures added. No real control was hiding behind either hole.
- **Guard false negative, round 2 (review pass 2):** the same class persisted in the body cleanup, which stripped child tags with a quote-blind `<[^>]+>` — a child like `<span v-if="count > 0">` left residue that counted as visible text. The reviewer verified the shipped function reproduced it before flagging. Fixed in round 3 with one shared quote-aware `TAG_BODY` fragment used for the open tag, child-tag strip and `<img>` matching alike; fixtures cover `>` in a child `v-if`, a child `:class` ternary and a child `<img v-if>`.
- **Remote validation crash (round 3):** the scoped gate's remote validation failed with "gate exit 137" during `bun install`, before any test ran. A rerun passed in 450 s. The cause of the first failure was not established; it did not recur.
- **Guard test import failure (round 1, engineer-side):** `import.meta.url` is not a `file:` URL under the UI vitest config, so the first version failed at import; switching to `__dirname` (the pattern used by the sibling `mobile-touch-affordances.test.ts`) fixed it.
- **Running the test suite outside the repo config (round 1, engineer-side):** bare `bunx vitest run` failed with `localStorage` undefined in unrelated suites; using `--config src/ui-app/vite.config.ts` fixed it.
- **CTO nudges "held":** three handoff-gate holds and one remote-validation hold appear in the activity log; these were normal gate-in-progress holds, resolved when each gate finished — not failures.

## Learnings

- **A `title`-only accessible name is a latent bug whenever a helper rewrites `title` at runtime.** The tooltip helper served sighted users while quietly removing the only name from keyboard/screen-reader users after first interaction. Any icon-only control that relies on `title` should also carry `aria-label`. Recorded in the committed audit; the general UI convention would also fit `docs/agent-ui-and-preview-conventions.md` — not yet added there.
- **Regexes that parse markup must be quote-aware everywhere, not just where the bug was seen.** A `>` inside any quoted attribute on any tag can end a match early; fixing only the open-tag regex left the same bug in the body cleanup. One shared quote-aware fragment removes the class, not the instance. Worth a general note in `docs/agent-debugging-and-incidents.md` if a future guard hits the same trap — not yet written there.
- **Zero results from a static scan need a negative fixture.** The engineer validated the scanner against a synthetic unnamed icon button before trusting its "found nothing"; this posture is what let reviews 1–2 be fixed quickly rather than argued.
- **Known ratchet limits are documented, not hidden:** the guard doesn't evaluate computed accessible names (a named child-component wrapper slips past) and treats any `{{ … }}` interpolation as a name. The audit states these plainly.
- **"Native title" in this codebase mostly means "styled tooltip fed by a title attribute"** (`tooltip.ts` restyles ~100 `title` uses across ~40 components), so the "no native title tooltips in new UI" rule targets new code; migrating existing ones is a separate refactor, recorded as such in the audit.

## Follow-ups

None recorded — no tasks were filed via Linked tasks. Note that the report's recommended follow-up — moving a `title` → `aria-label` fallback into `tooltip.ts` (rejected in this pass for blast-radius reasons) — was flagged by both the engineer rounds and the reviewer as worth its own task, but no linked task id exists in the record; whether it was filed elsewhere is not recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
