---
id: "1080"
title: "Review loop: cap rounds with an automatic scope freeze, priority-aware blocking bar, honour accepted-scope sections, auto-file follow-ups"
type: feature
status: inbox
priority: p1
area: [server, core]
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-09T12:14:25Z"
updated_at: "2026-11-09T12:14:25Z"
---
## Problem
Tasks routinely take 10-15 review rounds (#1058, #1060, #1061 each took 15; #1070 is at 4+). Each round is 20-40 minutes. Rounds are dominated by narrow edge cases found one at a time, reviewer bars that drift between rounds, and housekeeping failures, not by real defects in the change. The review prompt (`src/server/review.ts`) already says to report the whole bug class in one pass and never hold an instance back, and `review.humanFlagAfterPasses` (default 5) only flags needs-input; neither stops the loop.

## Desired UX
A review converges in 2-4 rounds. After that, remaining findings that are not real correctness or landing blockers become suggestions and follow-up tasks automatically, so the human can Move to done without hand-editing scope.

## Acceptance criteria
1. **Automatic freeze after N passes** (setting `review.freezeAfterPasses`, default 4, Settings UI control per AGENTS.md): from pass N+1 the reviewer prompt switches to "blocking = (a) a defect in behaviour this task introduced that breaks its own acceptance criteria, (b) a regression of existing behaviour, (c) a landing blocker. Everything else, including further edge cases of an already-fixed class and hardening ideas, goes under a new `## Suggestions (non-blocking)` heading and must not change the verdict."
2. **Priority-aware bar**: p3 tasks and tasks whose title starts with "Easter eggs bundle" use the lighter bar from pass 1 (correctness bugs and landing blockers only); p1/p2 use the full bar until the freeze.
3. **Accepted-scope sections are authoritative**: if the task body contains `## Accepted scope and known limitations` (any heading starting with "Accepted scope"), the reviewer prompt must quote it and say items listed there, and anything the section explicitly supersedes (for example acceptance criteria), are not blocking; add a test with a fixture task body.
4. **One enumeration**: require the report to end the `## Bugs` section with a one-line statement "No further findings of this class were found after grepping: <list>" and fix the prompt wording that lets a reviewer stop at the first instance; plus ask the engineer, in the handoff instructions, to self-review against the same checklist before requesting review.
5. **Auto follow-ups**: when a review has non-blocking suggestions after the freeze, offer a one-click "Create follow-up task" in the review panel (and `repoos` CLI parity) that files a task pre-filled from those findings; never files automatically without the human.
6. **Convergence report**: record for each task the number of rounds and the finding classes in `repoos stats` or the task drawer so repeated classes are visible; show "round N of ~4" in the review panel.
7. Prompts live in one place with tests (`default-agent-prompts.test.ts`); docs updated (docs/agent-workflow-rules.md, user-docs/review-and-close-out.md).
8. Housekeeping failures that waste rounds are NOT in this task; they are #1076 (stray other-task bookkeeping in branches) and #1061 (bookkeeping commits invalidating checks). Reference them in the report.

## Notes for AI
Start from `src/server/review.ts` (prompt around the "Earlier passes and the whole bug class" section, the `repeatedClasses` branch), `src/core/config.ts` (`review.humanFlagAfterPasses`, defaults and schema), `src/ui-app/tests/default-agent-prompts.test.ts`, and the review reports in work/reports/1058, 1060 and 1061 for real examples of the loop. The quickest, lowest-risk part is criteria 1-3 (prompt and setting only): land those first as one reviewable commit. Do not edit repoos.toml.

## Activity

- 2026-11-09T12:14:25Z · created · njachowski@gmail.com
