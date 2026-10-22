---
updated_at: "2026-10-22T15:57:47Z"
review_passes: 3
id: "0920"
title: "Needs-human-step banner: dedicated split action instead of generic PM flesh-out"
type: feature
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/needs-human-step-banner-dedicated-split-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-22T04:53:30Z"
review_rounds: 2
last_check_failure: "repoos check at 2026-10-22T15:08:30.954Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Needs human step banner and dedicated PM action (target \"default\"): highlight .agent-waiting matched nothing on /work?task=0920&tab=details (http://127.0.0.1:42259/work?shotState=card:humanStep)"
---
## Problem
A task flagged `needs_input: needs-human-step` shows the banner "Waiting for you" with the primary button **Send to PM (fleshes this out)**. That button is shared with `underspecified` (`needsInputPrimaryAction` in `src/ui-app/src/lib/needs-input-ui.ts`, both cases return `SEND_TO_PM_ACTION`). Clicking it runs `runNeedsInputPrimaryAction` in `src/ui-app/src/components/TaskDrawer.vue` (~line 3532), which sends the PM chat the canned message `PM_FLESH_OUT_CANNED_MESSAGE` ("Can you flesh this out?", `src/ui-app/src/stores/repo.ts:303`). Nothing in that message asks the PM to split the task, so the PM just replies in chat and usually no second task is created. The label is wrong for this reason, and the user has no confidence in what the click does (reported 2026-10-22 on #0915).

The flag itself is a keyword heuristic (`assessTaskNeedsHumanStep`) over the acceptance criteria: #0915 matched "credentials or keys" although the task only builds a check that an agent can implement and test with fakes. So the right outcome is sometimes "split", and sometimes "this is a false positive, record the override".

## Desired UX
- For `needs-human-step` the primary button has its own label and kind, for example **Split human step into its own task**, and a one-line description of what it will do. `underspecified` keeps **Send to PM (fleshes this out)**.
- The button sends the PM (or the agent the server picks for that role) an exact, server-built prompt, in the same way `fleshOutRequirementsPrompt` in `src/core/task-underspecified.ts` appends requirements to the canned flesh-out message. The prompt tells the agent to:
1. Decide which acceptance criteria truly need a human (a real device, account or credentials, or a third-party sign-up). Criteria an agent can satisfy with fakes or fixtures do not count.
2. If none need a human: record `repoos update <id> --human-step-override "<reason>"` and say why. No split.
3. Otherwise follow the AGENTS.md split rule: create the human part with `repoos new "<title>" --depends-on <id>`, then `repoos update <new> --assigned-to human --hold true`; narrow the original task's acceptance criteria to the agent-doable scope; keep the original's `needs_input` cleared.
4. Use only `repoos` commands, never hand-edit `work/*.md`.
- The drawer shows the outcome once the agent finishes: either a link to the new human task and the narrowed original, or the override reason. The banner clears when the flag clears.
- The existing PM-not-configured and PM-busy errors still appear. Dismiss and manual split keep working.

## Acceptance criteria
- Test: `needsInputPrimaryAction` returns a distinct action (label and kind) for `needs-human-step`, and `underspecified` is unchanged.
- Test: running the new action sends the split prompt (not "Can you flesh this out?") and the prompt contains the override command, the `--depends-on` / `--assigned-to human --hold true` split steps and the "never hand-edit task files" rule.
- Test: the prompt builder is a pure function with a snapshot or substring test, living beside `fleshOutRequirementsPrompt`.
- Test: after the agent splits, the original task's flag is cleared and the new task is `assigned_to: human`, `hold: true`, depending on the original (use the existing fake-agent test harness).
- Light and dark themes checked on the changed banner; declare a `## Shots` entry for a task drawer on a `needs-human-step` fixture.
- `user-docs/` and any doc describing the needs-input banner actions match the new behavior.

## Notes for AI
Start from `NEEDS_INPUT_*` tables and `needsInputPrimaryAction` in `src/ui-app/src/lib/needs-input-ui.ts`, the `send-pm` branch of `runNeedsInputPrimaryAction` in `TaskDrawer.vue`, and how the server appends `fleshOutRequirementsPrompt` for the canned flesh-out message. Mirror that pattern for the split prompt rather than putting prompt text in the UI. The split rule and the incident behind it (#0660, #0784) are in AGENTS.md ("Never close out human-gated work as if the human part were done"). Related: #0815 (override), #0804 (decision-model check). Keep the heuristic itself out of scope. Reported by the user on #0915, 2026-10-22.

## Shots
```json
[
{
"label": "Needs human step banner and dedicated PM action",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".agent-waiting",
"state": "card:humanStep"
}
]
```

## Activity

- 2026-10-22T04:53:30Z · created · njachowski@gmail.com
- 2026-10-22T14:52:43Z · status inbox→ready
- 2026-10-22T14:52:49Z · cli_override, model_override
- 2026-10-22T14:52:50Z · status ready→active, branch
- 2026-10-22T14:54:52Z · body
- 2026-10-22T14:56:11Z · body
- 2026-10-22T15:08:27Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Needs human step banner and dedicated PM action (target "default"): highlight .agent-waiting matched nothing on /work?task=0920&tab=details (http://127.0.0.1:42259/work?shotState=card:humanStep)
- 2026-10-22T15:09:30Z · body
- 2026-10-22T15:10:57Z · body
- 2026-10-22T15:15:14Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-10-22T15:15:15Z · status active→review
- 2026-10-22T15:16:54Z · note: review pass 1: needs some work
- 2026-10-22T15:16:55Z · status review→active
- 2026-10-22T15:16:57Z · CTO nudge: held — remote validation is running
- 2026-10-22T15:21:03Z · body
- 2026-10-22T15:26:33Z · body
- 2026-10-22T15:32:57Z · cli_override, model_override
- 2026-10-22T15:39:41Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-10-22T15:39:41Z · status active→review
- 2026-10-22T15:40:23Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (d07bb3269) during finalization (#0734)
- 2026-10-22T15:41:24Z · note: review pass 2: needs some work
- 2026-10-22T15:41:24Z · status review→active
- 2026-10-22T15:43:09Z · note: handoff requested (ui-review)
- 2026-10-22T15:47:04Z · CTO nudge: held — handoff gate is running
- 2026-10-22T15:56:20Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-10-22T15:56:22Z · status active→review
- 2026-10-22T15:57:23Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (b130b74eb) during finalization (#0734)
- 2026-10-22T15:57:47Z · note: review pass 3: good to go

