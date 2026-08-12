---
id: "0127"
title: Add GitHub Copilot CLI agent support
type: feature
status: review
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: feat/add-github-copilot-cli-agent-support
created_at: "2026-08-12T07:14:12Z"
updated_at: "2026-08-12T07:32:33Z"
---
## Problem

RepoOS detects the installed `copilot` executable but currently marks it
non-drivable. Its lifecycle is compatible with RepoOS, but its invocation,
continuation, and structured output conventions differ from the existing agent
adapters. Falling back to OpenCode would hide those differences and provide an
incorrect integration.

## Desired UX

A configured GitHub Copilot CLI agent can run an engineering prompt headlessly
inside a task worktree, stream a useful transcript to the Agent tab, and resume
the same Copilot session for follow-up prompts. The Agents page can detect and
configure it, including compatible model choices where verified.

## Acceptance criteria

- [ ] Add a dedicated Copilot CLI adapter that launches headless prompt runs in
  the task worktree with only the narrow, noninteractive tool permissions
  required for RepoOS-managed engineering work.
- [ ] Parse Copilot's JSONL output into RepoOS transcript events, preserving
  useful assistant text, tool activity, errors, and completion state.
- [ ] Extract and persist the Copilot session ID, then implement the matching
  resume command and output adapter for follow-up task-chat prompts.
- [ ] Detect Copilot CLI availability and expose its configuration in the Agents
  UI with an accurate drivable status.
- [ ] Probe model compatibility safely when the installed CLI supports it; live
  model discovery may remain optional if it cannot be verified reliably.
- [ ] Add fake-binary tests for command construction, JSONL parsing,
  session-ID extraction, resumption, detection, and model probing.
- [ ] Document Copilot CLI setup, behavior, permissions, model support, and
  any verified limitations.

## Notes for AI

- Do not implement Copilot support through an OpenCode fallback.
- Do not use broad `--allow-all`, `--yolo`, or equivalent unrestricted
  permission modes.
- Keep command construction, continuation, and transcript parsing specific to
  Copilot rather than assuming existing CLI adapters are compatible.
- Preserve existing agent behavior and use the repository's established fake
  executable test patterns.

## Activity

- 2026-08-12T07:14:12Z · created · unknown
- 2026-08-12T07:14:14Z · status inbox→ready
- 2026-08-12T07:17:09Z · status ready→active
- 2026-08-12T07:17:13Z · branch feat/add-github-copilot-cli-agent-support
- 2026-08-12T07:27:14Z · status active→review
- 2026-08-12T07:30:54Z · status review→active
- 2026-08-12T07:32:33Z · status active→review
