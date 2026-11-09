---
id: "1081"
title: "Review loop slice 2: enumeration closer, follow-up tasks, convergence report, Land anyway override"
type: feature
status: inbox
priority: p2
area: [server, core]
depends_on: ["1080"]
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-09T13:59:41Z"
updated_at: "2026-11-09T13:59:41Z"
---
## Problem
Slice 1 of #1080 adds the automatic freeze after `review.freezeAfterPasses`, the lighter bar for P3 and Easter-eggs tasks, and authoritative accepted-scope sections. It does not yet make the review loop converge on its own. Three things remain: reviewers still stop at the first instance of a bug class, remaining non-blocking findings are not turned into follow-up tasks, and the human has no way to accept known, non-blocking risk instead of looping again. Tasks still take 10-15 rounds (#1058, #1060, #1061).

## Desired UX
After the freeze, a review shows its non-blocking suggestions and the human can file them as a follow-up task in one click. When a review still says `needs some work` but its landing checks pass, the human can land the task anyway with a recorded reason. The review panel shows "round N of ~4", and the convergence history per task is visible so repeated classes show up.

## Acceptance criteria
1. **One enumeration**: the `## Bugs` section of every report ends, after any bug listed, with one line: `No further findings of this class were found after grepping: <list>`. The parser ignores that line so it never counts as a blocking bug. The reviewer prompt keeps the "do not stop at the first instance" wording. The engineer prompt asks for a self-review against the same checklist before handoff.
2. **Auto follow-ups**: when a review has non-blocking suggestions after the freeze, the review panel offers a one-click "Create follow-up task" that files a task pre-filled from those findings, with `repoos` CLI parity. It never files without the human.
3. **Convergence report**: record per task the number of rounds and the finding classes, shown in `repoos stats` or the task drawer, and show "round N of ~4" in the review panel.
4. **Land anyway override**: in the Move-to-done flow, a "Land anyway" action with a confirmation dialog and a recorded reason. It is allowed only when the remaining review findings are NOT landing blockers (verdict `needs some work`, landing checks pass). It never bypasses landing checks, tests or the close-out pipeline.
5. Prompts stay in one place with tests in `default-agent-prompts.test.ts`. Docs updated: `docs/agent-workflow-rules.md`, `user-docs/review-and-close-out.md`. Every new user-facing setting needs a Settings control.
6. Housekeeping failures are NOT in scope: #1076 (stray other-task bookkeeping in branches) and #1061 (bookkeeping commits invalidating checks). Reference them in the report.

## Notes for AI
Start from `src/server/review.ts` (`reviewMission`, the "Earlier passes and the whole bug class" section, the `## Bugs` output format), `src/core/review-report-sections.ts` (`isEmptyReviewSection` and the section parser) and `src/core/config.ts` (the engineer and reviewer DEFAULT_AGENTS text). Slice 1 (#1080) must land first. Do not edit repoos.toml.

## Activity

- 2026-11-09T13:59:41Z · created · njachowski@gmail.com
