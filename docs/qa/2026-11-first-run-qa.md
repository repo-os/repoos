# First-run onboarding and empty-project states QA — November 2026

Task #1224. A brand-new RepoOS project has no tasks, no configured agents and no
check plan. This pass reviews what such a user sees on the Work, Agents and
Checks pages at 375, 768 and 1280 px, and the first-run actions each page
offers, headlessly against preview fixtures.

## Scope and method

The pass ran against this task worktree with an auth-less preview server
(`just serve-noauth 7272`, `REPOOS_PREVIEW_CHILD=1`, mode "preview") and headless
WebKit Playwright. No visible browser was opened and no focus was stolen.

- States: `work:empty`, `agents:empty`, and a new `checks:emptyPlan` fixture
  added for this pass — the Checks plan tab with a genuinely empty, error-free
  plan (source `empty`, zero steps, zero errors, no recorded run). The pin is
  applied in `src/ui-app/src/lib/shot-preview-fixtures.ts` and consumed by
  `ChecksView.load()`, so captures show the first-run state without editing the
  repo's real `repoos.toml`.
- Widths: 375, 768 and 1280 px, light theme. The overflow measurement records
  document horizontal overflow and every visible element whose box extends past
  the viewport, excluding elements inside a purposeful horizontal scroller.
- Scripts committed under `docs/qa/`: `measure-first-run-widths.mjs` (layout,
  three states × three widths) and `first-run-interactions.mjs` (the first-run
  actions below, at 375 and 1280). Both wait for the state's own selector
  before measuring, which also rules out the loading-skeleton race.
- Reproduce: `just serve-noauth 7272 &`, then
  `QA_BASE=http://127.0.0.1:7272 QA_SHOTS=<dir> bun docs/qa/measure-first-run-widths.mjs`
  and `bun docs/qa/first-run-interactions.mjs`.

## Findings and disposition

| Finding | Evidence | Disposition |
| --- | --- | --- |
| On the Checks plan tab, a genuinely empty plan rendered three failure-flavoured signals at once: a red "No plan configured" chip, the amber "No checks configured" reminder, and a red trailing paragraph "This repo has no check plan…" repeating the reminder's guidance. #0592 explicitly rules the red failure tint out for an error-free empty plan. | Screenshot at 1280 and 768: red chip, amber card, red paragraph on one screen. | Fixed: the `data-source="empty"` chip is now neutral (`var(--txt-muted)`); the trailing red paragraph is suppressed when the amber reminder is already shown (the genuinely empty case) and kept — reworded to "No check steps resolved for this repo." — only for the odd zero-steps-without-errors plan whose source is not `empty` (`src/ui-app/src/views/ChecksView.vue`). |
| On the mobile Work queue, the count line under the title read "No matching tasks" on a project with zero tasks. Nothing was filtered out — there is nothing to match; the desktop empty state correctly says "Start this project with a task". | `MobileWorkQueue.countLabel` returned "No matching tasks" whenever `matchingCount` was 0. | Fixed: with zero tasks on the board it now reads "No tasks yet"; a real filter miss (tasks exist, the filter hides them) still reads "No matching tasks" (`src/ui-app/src/components/MobileWorkQueue.vue`). |
| The Checks page had no preview fixture for its first-run state, so the no-plan reminder could not be reviewed or captured against a first-run repo. | No `checks:emptyPlan` id in `SHOT_PREVIEW_FIXTURE_IDS`. | Fixed: fixture added (`src/core/shot-fixtures.ts`), pinned plan payload + `ChecksView` consumption, covered by `src/ui-app/tests/checks-empty-plan-first-run.test.ts`. |
| Links and wording facts were audited on all three states. | `https://docs.repoos.org/check`, `/agents` resolve (200); `repoos init` really does propose a starter check plan (`src/commands/init.ts` `proposeCheckPlan`); both empty-state buttons open real actions. | No defect found. |

## First-run paths exercised (headless, 375 and 1280)

- Work, empty board → **Create your first task** (375) / **Create a task**
  (1280) opens the shared new-task drawer; no page or console errors.
- Agents, no roles → **Choose a built-in agent** switches to the Build Your
  Team tab (`aria-selected="true"`, panel visible) at both widths.
- Checks, no plan → the amber reminder renders; **Copy CLI hint** flips to
  "Copied" and the paragraph disappears from the page (it is suppressed under
  the reminder now). "File a task" was not clicked in the preview: the read-only
  preview server refuses writes, and filing is covered by the component's own
  tests.

## Checked with no defect found

- Layout: zero document overflow and zero off-viewport controls on all three
  states at 375, 768 and 1280, light theme, after the fixes.
- Work: desktop empty card, mobile "No tasks yet" card, and the failed-load
  variant (`work:failedLoad`) all keep their distinct, plain-English wording.
- Agents: the first-run card, tab strip and empty custom-agents line wrap
  cleanly at all three widths.
- Checks: "No recorded run yet — the last result appears here after
  `repoos check` runs." reads correctly for a first-run repo.
- No page errors on any state; the only console entries were the expected
  access-control 401s documented by earlier passes (#1170).

## Regression coverage

- `src/ui-app/tests/checks-empty-plan-first-run.test.ts` — the fixture pins a
  genuinely empty plan, the page renders the amber reminder without fetching
  the real plan and without a red error line, and the pin clears on reset so
  the page fetches normally afterwards.
- `src/ui-app/tests/mobile-work-queue.test.ts` — the count line distinguishes
  "No tasks yet" (empty board) from "No matching tasks" (filter miss).

## Not verified

- Real devices and touch input were not tested.
- The "File a task" button's server round-trip was not exercised from the
  preview (read-only server); its behaviour is covered by the reminder's
  component tests and the task-creation API tests.
- Dark theme was not re-measured for these states; the checks empty-plan colour
  change uses the existing `var(--txt-muted)` token, which the rendered
  contrast audit in `repoos check` exercises.
