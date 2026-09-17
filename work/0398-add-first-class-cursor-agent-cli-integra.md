---
id: "0398"
title: Add first-class Cursor Agent CLI integration
type: feature
status: active
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: feat/add-first-class-cursor-agent-cli-integra
created_at: "2026-09-17T16:34:39Z"
updated_at: "2026-09-17T17:06:32Z"
---
## Problem

Cursor users cannot choose Cursor Agent CLI as a first-class RepoOS agent. The generic `agent` executable name is unsafe to rely on because it can collide with another tool on PATH; RepoOS must integrate the explicit `cursor-agent` binary and give Cursor users the same managed-worktree, live-output, handoff, and resume experience as the supported drivers.

Cursor Agent CLI is a strong fit for RepoOS: it supports non-interactive print mode, structured JSON/stream-JSON output, explicit model selection, and session resume. It also reads project `AGENTS.md` and `CLAUDE.md`.

## Goal

Add a production-quality Cursor Agent CLI driver to RepoOS. A user who has authenticated Cursor locally can select Cursor from the Agents page and run engineer, PM, reviewer, and task follow-up sessions in RepoOS-managed worktrees.

## Driver contract

- Detect only the `cursor-agent` executable. Never probe, install, or invoke a bare `agent` command.
- Give a clear install hint using Cursor's official installer and a separate actionable authentication hint when the binary exists but is not logged in.
- Launch non-interactively with Cursor's supported print mode and structured stream output, in the registered task worktree.
- Choose a permission mode that permits normal worktree edits and project checks without hanging for terminal approval. Make the trust boundary explicit: RepoOS only launches it in the dedicated task worktree, never the main checkout.
- Parse Cursor stream-JSON defensively: assistant deltas, tool start/completion, errors, terminal result, session ID, model, duration, and any available usage fields. Unknown future event fields must not break a run.
- Store Cursor's session ID and implement follow-up/resume against that exact session. Handle missing, expired, or incompatible sessions with a useful recovery path rather than silently starting unrelated work.
- Support `default` plus a user-configured model passed through Cursor's documented model flag. Do not claim live model discovery unless Cursor exposes a reliable machine-readable model list.
- Keep RepoOS's own handoff, check, review, task status, commit, and merge controls authoritative. Cursor must not bypass RepoOS lifecycle rules.

## Product/UI work

- Add Cursor to agent detection, config validation, role selection, per-task overrides, model compatibility testing, and documentation.
- Display Cursor's recognizable name and a useful capability note in the Agents UI.
- Surface clear errors for: missing binary, old/unsupported CLI version, authentication required, permission denial, malformed structured output, and failed/abandoned sessions.
- Verify that the optional RepoOS AGENTS.md appendix and existing project instructions are available to Cursor without overwriting user-owned instructions.

## Tests

Add fixture-driven tests for Cursor's current stream-JSON protocol, including a successful multi-step edit, tool failure, terminal error, partial/malformed lines, session capture, and follow-up resume. Add process/argv tests proving RepoOS invokes `cursor-agent` rather than `agent`, uses the task worktree, and passes the selected model only when configured.

Run an end-to-end compatibility probe against an installed Cursor Agent when available, but keep the main test suite deterministic with fake binaries/fixtures.

## Acceptance criteria

- Cursor appears as a selectable, detected RepoOS CLI only when `cursor-agent` is available.
- A Cursor-run task works in an isolated RepoOS worktree, streams understandable live activity, and reaches normal RepoOS handoff/review.
- Follow-up messages resume the correct Cursor session.
- Existing AGENTS.md/CLAUDE.md instructions are respected.
- Missing installation/auth/version/permission failures tell the user what to do next.
- No invocation path uses a bare `agent` binary.
- Automated tests cover the protocol and failure cases; docs explain install, authentication, capabilities, and known limitations.

## Activity

- 2026-09-17T16:34:39Z · created · unknown
- 2026-09-17T17:06:29Z · status inbox→ready
- 2026-09-17T17:06:32Z · status ready→active, branch
