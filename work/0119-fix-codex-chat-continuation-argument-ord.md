---
id: "0119"
title: Fix Codex chat continuation argument ordering
type: bug
status: review
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: feat/fix-codex-chat-continuation-argument-ord
created_at: "2026-08-12T05:02:11Z"
updated_at: "2026-08-12T05:31:41Z"
---
## Activity

- 2026-08-12T05:02:11Z · created · unknown
- 2026-08-12T05:30:32Z · status active→review · implementation and handoff-event regression checks green


## Problem

Sending a follow-up message from a task's Agent tab calls
`AgentRunner.send()`, which builds this Codex command:

```text
codex exec resume <session-id> <prompt> --model <model> --json --sandbox workspace-write
```

`--sandbox` is an option of `codex exec`, not its `resume` subcommand. Once
`resume` has been parsed, Codex rejects it with:

```text
error: unexpected argument '--sandbox' found
```

The agent stops without receiving the human's message. This makes the Agent
tab's normal continuation path unusable for Codex and encourages expensive
fresh sessions that must rediscover context.

## Desired UX

When a Codex engineer turn has stopped, sending a message in the task Agent tab
continues the same Codex session in the same worktree, using the configured
model and `workspace-write` sandbox. The user sees the new streamed turn rather
than a CLI usage error.

## Acceptance criteria

- [ ] `resumeCommand()` places exec-level options before the `resume`
      subcommand. The resulting shape is equivalent to:
      `codex exec --sandbox workspace-write resume --model <model> --json
      <session-id> <prompt>`.
- [ ] A known session ID is passed exactly once; when unavailable, `--last` is
      used without changing the option ordering.
- [ ] Explicit models and the `default` model behavior remain correct.
- [ ] The resumed process stays in the task worktree and retains the same
      workspace-write safety boundary as a fresh Codex turn.
- [ ] Add fixture tests for known-session and `--last` commands that fail if an
      exec-only flag is placed after `resume`.
- [ ] Add an integration-style regression test that sends a follow-up through
      `AgentRunner.send()` and proves the fake Codex resume turn receives and
      streams the message instead of exiting with argument-parser failure.
- [ ] Audit other driver resume commands for the same parent/subcommand option
      ordering mistake; change them only if a test demonstrates the issue.
- [ ] `repoos check` passes.

## Notes for AI

- Primary code: `resumeCommand()` in `src/server/agents.ts`.
- Primary tests: `src/ui-app/tests/agent-drivers.test.ts`.
- Confirm the installed CLI contract with both `codex exec --help` and
  `codex exec resume --help`; do not guess from the fresh-turn command.
- This task fixes continuation of the same agent conversation. It must not
  change **Resume worktree**, which intentionally preserves filesystem work
  while launching a fresh agent session with a context/diff preamble.
- Related but separate: sandboxed agents currently cannot reach RepoOS's
  localhost preview API. Do not broaden this small task into control-plane
  transport design.

## Activity

- 2026-08-12T05:18:34Z · status ready→active, branch
- 2026-08-12T05:31:41Z · status active→review
