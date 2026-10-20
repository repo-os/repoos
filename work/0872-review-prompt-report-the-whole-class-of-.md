---
id: "0872"
title: "Default agent prompts for every project: reviewer (whole class, merge check, evidence gaps), engineer and PM learnings"
type: chore
status: inbox
priority: p1
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-20T12:06:43Z"
updated_at: "2026-10-20T12:18:19Z"
---
## Problem
The review prompt built in src/server/review.ts (the shared part every project gets) does not tell the reviewer to find every instance of a bug class, to read earlier review reports, or to check that the branch merges with its base. The result on 2026-10-20: #0843 needed 22+ review passes, #0854 15+, #0861 13, each pass finding one more instance of the same class (service-lifecycle teardown, runner fallback and import safety, config-key registration), plus avoidable rounds on evidence-only gaps and a "good to go" on a commit that still conflicted with main (#0860). For RepoOS itself the reviewer role text in repoos.toml was updated by hand on 2026-10-20; every other project still gets the old behavior.

## Desired UX
The shared review prompt makes the reviewer: name the class of each bug and grep the diff and touched files for every other instance, listing them all in one report; read the newest earlier reports for this task, verify each finding was fixed and not re-report fixed items as new; separate code defects from evidence-only or stale-evidence gaps and verify that each declared shot's target and route can render its declared state; confirm the branch merges cleanly with its base before "good to go" and name conflicting files. The `repoos init` reviewer template carries the same text. After about five "needs some work" passes on one task, the next report starts with a short summary of the repeated classes and the task is flagged for a human.

## Acceptance criteria
- src/server/review.ts shared prompt contains the class-enumeration, earlier-report, evidence-gap, and merge-ability instructions; existing verdict/section format rules are unchanged and the parser tests pass.
- The `repoos init` reviewer role template is updated the same way (src/commands/init.ts); do NOT edit this repo's own repoos.toml (the human already did).
- A prompt-content test asserts each instruction is present and the old format guarantees still are.
- After N passes (default 5, configurable with a Settings control and docs) the report includes the repeated-class summary and the task shows a human-attention flag, distinct from the existing review-rounds-exhausted backstop.
- docs updated (the review/close-out docs).

## Notes for AI
The repoos.toml reviewer instructions were already extended with the same guidance on 2026-10-20 and can be used as the wording source (grep `Report the WHOLE CLASS` in repoos.toml). Keep the prompt short enough that it does not slow reviews noticeably. Related: #0865 (stop reviews chaining), #0866 (shot target validation), the landable command task.

## Activity

- 2026-10-20T12:06:43Z · created · njachowski@gmail.com
- 2026-10-20T12:18:19Z · title
