---
task: "1074"
pass: 3
at: "2026-11-11T05:29:23.211Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/require-a-step-by-step-guide-on-every-hu
state: ok
tree_identity: "a63f7c801:e77e50a42"
---
## Verdict
needs some work — merge conflict with main, a PM split prompt missing the guide rule, and no captured proof of the drawer banner.

## Relevance
still relevant — main has no step-by-step guide requirement, and the human-task gap the spec describes is still there.

## Evidence
None. The declared shot (`/work?task=9999&tab=changes`, state `card:humanStep`, highlight `[data-test-id="human-guide-warning"]`) is in the task file but was never captured. The only capture is the Control dashboard at `/` (`work/.attachments/1074/shots/default-1.png-1.png`), which shows no banner. This is a blocking gap, listed under Bugs.

## Bugs
- **Merge conflict:** `src/ui-app/tests/pm-canned-messages.test.ts` conflicts with main (server landing checklist). The branch also changes that test in ways the report never mentions: it adds a config-store mock and swaps the `.questions-for-you-answer` click for an "Answer in PM" button lookup. That is outside this task. Resolve the conflict, and explain or drop the unrelated edit.
- **PM split prompt has no guide rule:** `splitHumanStepRequirementsPrompt()` in `src/core/task-underspecified.ts:425-431` tells the PM to run `repoos new … --depends-on` and `repoos update --assigned-to human --hold true`, with no mention of `## Step-by-step guide`. `PM_SPLIT_HUMAN_STEP_MESSAGE` (line 422) is the same. The spec requires the PM guidance wherever built-in prompts live. Only `config.ts` (PM and engineer defaults) was updated.
- **Banner not verified visually:** the spec requires the warning to be "surfaced on the task in the UI". No capture shows the drawer or the banner, so this criterion has no evidence.
- **Scaffold placeholder passes silently:** `humanTaskGuideWarning` only checks the heading line. A human task created with no body gets `HUMAN_TASK_SCAFFOLD` (`src/core/repoos.ts:304`), which contains the heading plus italic prompt text, so the warning never fires even though no steps were written. This is the same gap the task exists to close. The spec's literal wording is met, so I'm listing it here rather than as a separate blocker. Same class: an unfilled heading counts as present in the CLI, HTTP and drawer paths alike.

## Edge cases
- The heading regex matches inside fenced code blocks, so a guide quoted in a code sample would satisfy the check.
- `patchTask` (`src/server/routes/tasks.ts:1252`) calls `humanTaskGuideWarning` twice. Behaviour is correct; the duplicate is cosmetic.
- `isHumanAssigned` trims and lowercases, but the scaffold check in `repoos.ts:304` uses `assignee === "human"`. These only diverge for non-canonical casing, which the assignee resolver already normalizes.

## Suggestions
- Move the new `describe("human task guide warning")` block in `task-underspecified-flag.test.ts` below the imports; it currently sits between two import statements.
- Consider warning when the guide body is only the placeholder italic line.
- Verified: `repoos update --section "Step-by-step guide" --section-body` is supported (`src/commands/tasks.ts:786-801`). CLI create/update, HTTP create/patch and the drawer all use the shared warning.
- Re-capture the drawer with the declared shot on the final tree.

## Could not verify (environment)
- Merge status: taken from the server landing checklist; I did not run `git merge-tree`.
- The engineering report says the declared `card:humanStep` shot was captured, but the handoff evidence JSON records only the auto `/` shot.

## Verdict
needs some work — merge conflict with main, a PM split prompt missing the guide rule, and no captured proof of the drawer banner.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T05:13:17.497Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

