---
id: "0058"
title: Drive the gemini CLI as a headless engineer agent
type: feature
status: ready
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/0058-gemini-driver
created_at: "2026-08-10T23:03:19Z"
updated_at: "2026-08-10T23:03:19Z"
---
## Activity

- 2026-08-10T23:03:19Z · created · unknown

## Problem

RepoOS drives coding agents headless (0037), streams their output (0042), and
detects installed CLIs (0043). Today only four CLIs are `drivable`: opencode,
claude code, qwen code, and codex. The gemini CLI
(`@google/gemini-cli`, binary `gemini`) is detected but marked
`drivable: false` — even though its headless surface matches the qwen/codex
driver shape almost 1:1. A user with `gemini` installed cannot select it on the
Agents page (`cli` is not in `AGENT_CLIS`), and there is no spawn/resume wiring
for it.

## Desired UX

An agent configured with `cli = "gemini"` can be started on a task, stream live
output to the task's chat tab, and be resumed for follow-up turns — exactly as
opencode/claude/qwen/codex behave today. The Agents page shows gemini as
installed & headless-ready when it's on PATH.

## Acceptance criteria

- [ ] `AGENT_CLIS` in `src/core/config.ts` includes `"gemini"` so the Agents
      page offers it as a `cli` choice.
- [ ] `drivable` is `true` for gemini in `KNOWN_AGENTS`
      (`src/core/detect.ts`); `GET /api/agents/detect` reports it headless-ready
      when the binary resolves on PATH.
- [ ] `cliCommand` in `src/server/agents.ts` maps `gemini` to
      `gemini -p <mission> --output-format stream-json` (spawn `cwd` is the
      worktree — gemini needs no `--dir` flag, like claude/qwen).
- [ ] `resumeCommand` maps follow-up turns to
      `gemini -p <text> --resume <id> --output-format stream-json`, falling
      back to `--resume latest` when no session id was captured. Use `-p` for
      the follow-up text: stable gemini builds reject positional args/stdin
      with `--resume` (resolved upstream in 0.20, but `-p` works everywhere).
- [ ] `promptCommand` maps gemini to `gemini -p <prompt>` so the one-shot PM
      agent path works too.
- [ ] Streaming and session resume work end to end: the runner's existing
      `SESSION_ID_PATTERNS` already match gemini's `init` event
      (`"session_id":"..."`), so a follow-up turn resumes the same session; a
      fixture E2E with a fake `gemini` binary verifies spawn args, streaming,
      and resume args (matching the 0042/0043 fakebin pattern).
- [ ] `repoos check` passes; zero new runtime dependencies.

## Notes for AI

- **Flags (verified against gemini-cli docs, headless mode):**
  - `gemini -p "query"` runs headless print mode (also triggers on non-TTY).
  - `--output-format stream-json` emits newline-delimited JSON: `init`
    (carries `session_id` and `model`), `message` (user/assistant deltas),
    `tool_use`, `tool_result`, `error`, `result`. This is the same JSONL shape
    the qwen/codex drivers already stream, and the existing line-buffered
    `onData`/`tryExtractSessionId` handles it unchanged.
  - Resume: `gemini --resume latest "query"` or `--resume <id>`. Known caveat
    (issue #14180): positional args and stdin don't work with `--resume` in
    stable builds (≤0.18/0.19) — only `--prompt`. Use `-p` to be safe.
- **Zero runtime deps**: spawn is already `node:child_process`; no new deps.
- **Don't regress the existing drivers**: gemini is additive. Keep the default
  (opencode) branch of each mapping untouched; `resolveEngineer` and the agent
  config model must keep working unchanged. gemini must not become the launch
  command unless the user configured it.
- **Cwd is the worktree**: gemini resolves its project from the spawn `cwd`,
  so resume must pass `session.workdir ?? config.root` exactly as qwen/claude
  do — do not add a `--dir` flag.
- **Test alongside**: unit tests for the three command mappings (fake gemini
  bin asserting exact args, including the `--resume` fallback) and a
  fixture E2E for streaming + resume, mirroring the 0042 pattern. The detect
  flip is covered by the existing detection tests.
- **Out of scope**: UI work beyond exposing the `cli` choice (the Agents page
  reads `AGENT_CLIS` dynamically); no changes to the opencode-style output
  rendering (0053/0045 territory). `AGENT_MODELS` labels stay RepoOS-side and
  are deliberately not forwarded to any CLI.

## Related

- 0037 · Start/Pause + headless spawn (the runner this wires into)
- 0042 · Streaming agent output (the JSONL/SSE pattern to mirror)
- 0043 · Detect installed coding agents (gemini currently listed as undrivable)
- 0056 · Test Claude Code agent for PM (the one-shot PM-agent path)
