---
id: "0406"
title: Add Antigravity CLI integration and deprecate Gemini CLI
type: feature
status: review
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: feat/add-antigravity-cli-integration-and-depr
cli_override: codex
model_override: gpt-5.6-luna
review_cli_override: codex
review_model_override: gpt-5.6-terra
created_at: "2026-09-18T08:54:55Z"
updated_at: "2026-09-18T11:51:45Z"
review_passes: 4
review_rounds: 2
skill_suggestion: "0407"
handoff_signal_retry_count: 2
dev_error_count: 1
---
## Problem

RepoOS currently detects the legacy `gemini` executable as a non-drivable coding agent and suggests installing Gemini CLI, but Google has moved individual and free users to Antigravity CLI. That leaves a misleading discovery row and no first-class path for the current Google terminal agent.

Google Antigravity CLI installs as `agy`, supports non-interactive prompts, machine-readable output, model selection, local and SSH authentication, and a Gemini API-key mode. It is therefore a strong candidate for a managed RepoOS driver. Gemini CLI still has enterprise and paid API-key use cases, so its UI must be deprecated for ordinary users rather than falsely presented as universally unavailable.

## Goal

Add a production-quality Antigravity CLI driver. A locally authenticated user can choose Antigravity for PM, engineer, reviewer, and task follow-ups in RepoOS-managed worktrees. Make the Gemini discovery/UI path clearly deprecated and point users to Antigravity without deleting their historical task data or silently changing configured agents.

## Driver contract

- Detect and invoke only the official `agy` executable. Use the official Antigravity installer in install guidance.
- Probe version, availability, and authentication safely. Explain local keyring sign-in, SSH browser-code sign-in, and optional `GEMINI_API_KEY` mode without reading, persisting, or exposing credentials.
- Use the documented non-interactive prompt mode and machine-readable output. Validate the exact output protocol against the installed CLI and fixture it; do not infer a Cursor- or Gemini-shaped event stream.
- Discover models through the documented `agy models` command when it returns a reliable parseable list. Preserve a default choice and pass a selected model through the documented flag.
- Run only in RepoOS task worktrees. Resolve headless permissions deliberately: ordinary task edits and permitted checks must not block forever, but do not silently broaden access beyond the documented Antigravity permission model. Document the security tradeoff of any blanket permission bypass.
- Capture understandable live output, errors from stderr, terminal status, duration, selected model, and any usage data the CLI actually reports. Unknown or malformed protocol events must fail helpfully rather than corrupt a task session.
- Implement exact-session follow-up/resume only if the documented CLI API supports a reliable session identifier. If it does not, start a clearly-labelled fresh turn and state that limitation in the UI/docs.
- Keep RepoOS authoritative for worktrees, task lifecycle, checks, review, commits, merges, and handoff. The driver must not bypass those controls.

## Gemini deprecation UX

- Keep the existing Gemini detection row so installed legacy tooling remains visible, but mark it `Deprecated` for individual/free users.
- Replace the Gemini install recommendation with concise guidance: `Use Antigravity CLI (agy) instead.` Include an official migration/docs link and a short note that enterprise and paid API-key Gemini CLI users may still have access.
- Make Antigravity the selectable, drivable Google option in agent configuration, per-task overrides, compatibility testing, and documentation. Do not make the deprecated Gemini row selectable for new agent assignments.
- Preserve existing task history and config values. If a repository has a legacy Gemini selection, show a clear migration/error state rather than silently replacing it.

## Tests

- Add fake-binary and fixture tests for detection, version/auth failures, model discovery, prompt argv, structured output, stderr failures, permission-denial guidance, malformed events, and process exit handling.
- Test that worktree cwd is passed, a selected model is passed only when pinned, and no prompt path invokes Gemini or a generic binary.
- Add a compatibility probe for an installed authenticated `agy` when available, while keeping the normal suite deterministic and network-free.
- Cover the Deprecated Gemini card/copy, non-selectability, migration guidance, and existing-config compatibility.

## Acceptance criteria

- `agy` appears as a first-class selectable RepoOS CLI only when installed; its detection card gives accurate install and sign-in guidance.
- An Antigravity-run task can edit in an isolated RepoOS worktree, presents understandable progress/failure output, and reaches the usual RepoOS review boundary.
- Model options come from verified CLI behavior, and unsupported pins fail with actionable feedback.
- Follow-up behavior is exact-session when supported; otherwise the fresh-turn limitation is explicit.
- Gemini is visibly deprecated for individual/free users with `Use Antigravity CLI (agy) instead`, while enterprise/API-key caveats and historical records are preserved.
- Automated tests and docs cover the real protocol, permission behavior, authentication recovery, model discovery, and migration path.

## Activity

- 2026-09-18T08:54:55Z · created · unknown
- 2026-09-18T09:14:28Z · cli_override
- 2026-09-18T09:15:47Z · model_override
- 2026-09-18T09:16:07Z · review_cli_override, review_model_override
- 2026-09-18T09:16:12Z · review_model_override
- 2026-09-18T09:16:27Z · status inbox→ready
- 2026-09-18T09:16:28Z · status ready→active, branch
- 2026-09-18T10:11:20Z · agent exited with an error (codex) · 2026-09-18T10:10:43.437688Z ERROR codex_models_manager::manager: failed to renew cache TTL: missing field `supports_parallel_tool_calls` at line 99 column 5
- 2026-09-18T10:28:23Z · needs_input
- 2026-09-18T10:53:13Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-09-18T10:53:13Z · status review→active
- 2026-09-18T11:08:13Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-09-18T11:08:13Z · status review→active
- 2026-09-18T11:29:13Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-09-18T11:44:07Z · status review→active
- 2026-09-18T11:44:07Z · note: Round-3 review findings fixed by interactive session in 1992a8dd (auto-bounce cap reached); full repoos check green in worktree
- 2026-09-18T11:44:25Z · status active→review
- 2026-09-18T11:51:34Z · status review→active
- 2026-09-18T11:51:34Z · note: Round-4 review findings fixed in 1003d4f3 (board-chat guard, one-shot envelope validation); full repoos check green
- 2026-09-18T11:51:45Z · status active→review
