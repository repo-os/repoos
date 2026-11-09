---
id: "1074"
title: Require a step-by-step guide on every human-assigned task
type: feature
status: ready
priority: p2
area: [core, agent]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/require-a-step-by-step-guide-on-every-hu
created_at: "2026-11-09T07:52:08Z"
updated_at: "2026-11-09T21:05:12Z"
handoff_signal_retry_count: 2
---
## Problem
Tasks assigned to a human (`--assigned-to human`, usually held, e.g. an account sign-up, a signing key, a real-device check) are often filed as a few lines of acceptance criteria. The human then has to decode what to do. Concrete case: in the Tiao project, tasks #0032 (create and back up a release keystore) and #0033 (sign up for a flight-status provider, set the key, verify a real lookup) were filed with two-line outcomes, and the human (Nick) asked for exact steps. The step-by-step guides had to be written afterwards by hand. Human tasks are the one place where the reader is the least able to infer missing detail, and nothing in RepoOS asks for it.

## Desired UX
Every human-assigned task body contains a `## Step-by-step guide` section that a non-expert can follow without asking anything: numbered steps, the exact commands (in fenced blocks) or click paths, what to paste where, where secrets go (never into chat, tasks or git), what could go wrong and how to tell it worked, and what to report back. When an agent or the PM files a human task without one, RepoOS says so immediately instead of letting it sit unreadable.

## Acceptance criteria
- The PM agent instructions (the shipped default `pm` agent prompt and wherever the built-in prompts live) require a `## Step-by-step guide` section for any task filed with `--assigned-to human` or created by splitting out a human step, with the content rules above (numbered steps, exact commands, where secrets go, a "how you will know it worked" line, what to report back). Do not require it for AI tasks.
- Engineer-agent instructions: when an engineer asks for a human step to be split out (needs-human-step), the split-off task must include the guide too.
- Task creation and update (`repoos new`, `repoos update`, the HTTP API) emit a clear warning (not a hard failure) when `assigned_to: human` and no `## Step-by-step guide` heading exists, naming the missing section. Warning text is shown in the CLI output and surfaced on the task in the UI.
- The task template / `repoos new --human` scaffold includes an empty `## Step-by-step guide` heading with a short prompt describing what belongs there.
- `repoos update --section "Step-by-step guide" --section-body ...` works for editing just that section (confirm it does; the full `--body` guard otherwise forces authors to resend every spec section).
- Tests cover: warning when the section is missing on a human task, no warning on AI tasks, no warning when present, and the scaffold output. Existing tasks are not rewritten or blocked.
- Docs: a short note in `user-docs/` (where human tasks are explained) and the relevant `docs/agent-workflow-rules.md` line; keep AGENTS.md under its size limit (one or two lines max, link to docs).
- Respect AGENTS.md rules: no new runtime dependencies, the Settings-UI rule does not apply unless a new `repoos.toml` key is added (avoid adding one).

## Notes for AI
Look at how `needs-human-step` is detected and how held human tasks are created (`repoos new --human --hold`, `repoos update --assigned-to human`, the split guidance in AGENTS.md "Never close out human-gated work as if the human part were done"). The default PM prompt text lives in the built-in agent defaults; the Tiao project also carries a copy in its `repoos.toml` agent instructions, so a project's own prompt will not pick this up automatically: make the warning (code) the enforcement and the prompt the guidance. Example of the target quality: Tiao tasks #0032 and #0033 (ssh to bee repo `~/code/nick/tiao`, see `repoos/work/0032-*.md`, `0033-*.md`) after their guides were added.

## Activity

- 2026-11-09T07:52:08Z · created · njachowski@gmail.com
- 2026-11-09T07:58:10Z · status inbox→ready
- 2026-11-09T19:57:02Z · status ready→active, branch
- 2026-11-09T20:02:17Z · message_queued at 2026-11-09T20:02:17.663Z
- 2026-11-09T20:04:16Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T20:09:33Z · message_queued at 2026-11-09T20:09:33.278Z
- 2026-11-09T20:14:46Z · watchdog: auto-surfaced stuck task · status active→ready · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-09T20:46:54Z · message_delivered: 2 message(s)
- 2026-11-09T21:04:41Z · body
- 2026-11-09T21:05:12Z · body
