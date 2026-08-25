---
id: "0058"
title: Drive Antigravity CLI (agy) as a headless engineer agent and retire Gemini CLI
type: feature
status: inbox
priority: p3
area: agent
assigned_to: ai
created_by: ""
branch: feat/0058-antigravity-cli-driver
pm_model_override: default
created_at: "2026-08-10T23:03:19Z"
updated_at: "2026-08-25T09:10:06Z"
---
## Problem

RepoOS currently detects the legacy Gemini CLI but cannot drive it, and task #0058 proposed completing that integration. Google now positions Antigravity CLI, binary agy, as the successor for terminal agent workflows and encourages Gemini CLI users to migrate. Keeping Gemini visible on the Agents page while adding a parallel replacement would confuse users and duplicate driver work.

Antigravity has promising automation surfaces: non-interactive prompts, per-run model selection, a programmatic model list, configurable permissions, local repository tools, and support for AGENTS.md and SKILL.md. Its documented non-interactive mode may not support conversational follow-ups, and a structured streaming format or stable resumable session interface is not yet established. RepoOS must represent those capabilities honestly instead of assuming parity with OpenCode, Claude Code, Qwen Code, or Codex.

## Desired UX

When agy is installed and authenticated, the Agents page detects Antigravity CLI and lets the user configure it for RepoOS tasks. RepoOS can launch it in the task worktree, select a model reported by agy models, retain useful output, stop it, and interpret completion safely. Unsupported capabilities such as structured streaming or same-session resume are clearly degraded rather than silently simulated. Gemini CLI is removed from the supported/detected Agents-page choices, with concise migration guidance wherever a legacy manual configuration is encountered.

## Acceptance criteria

- [ ] Replace the legacy Gemini CLI scope of this task with an Antigravity CLI adapter using the agy binary; do not add a second duplicate Gemini task.
- [ ] Add Antigravity to the supported CLI/config registry and installed-agent detection with an accurate install or migration hint. Detection is fail-soft and bounded by a timeout.
- [ ] Remove Gemini CLI from the Agents-page known/supported agent list and from user-facing model/agent choices. Remove stale copy that recommends installing or integrating Gemini CLI.
- [ ] If a manually written legacy config still names gemini, preserve the file and return a clear unsupported/migrate-to-agy diagnostic; do not silently rewrite user configuration.
- [ ] During implementation, verify the installed/current agy --help and official documentation for non-interactive invocation, model selection, model listing, permissions, output formats, cancellation, exit codes, and any session/resume support. Record the verified compatibility matrix in tests or focused documentation.
- [ ] Launch initial engineer turns non-interactively in the task worktree with the configured model when provided. Default model selection omits the model argument.
- [ ] Integrate agy models as a CLI-specific model source. Parse defensively, deduplicate results, bound execution time and output, and fail soft when unauthenticated, unavailable, or changed.
- [ ] Reuse the real Antigravity command builder in the Agents-page compatibility probe so a passing model test represents the command RepoOS will launch.
- [ ] Do not claim same-session chat resume unless a stable programmatic interface and session identifier are verified. If unavailable, follow-up work uses a clearly labelled fresh Antigravity turn in the same worktree with RepoOS resume context, or the UI disables unsupported continuation behavior.
- [ ] Do not claim structured tool events unless agy exposes a documented machine-readable stream. Plain output must remain readable and must not be misparsed as OpenCode events.
- [ ] Stop/pause terminates the correct process tree and releases RepoOS resources without affecting other task agents.
- [ ] Choose the narrowest supported non-interactive permission policy that permits worktree edits. Do not broaden filesystem or network authority beyond the task worktree merely to avoid prompts, and document any unavoidable limitation.
- [ ] Add fake-binary tests covering detection, start arguments, default and explicit models, model-list parsing, output capture, non-zero exit, missing authentication, timeout/cancellation, legacy Gemini diagnostics, and the verified resume/degradation behavior.
- [ ] Update relevant product/agent documentation, rebuild UI assets, refresh affected screenshots, and pass repoos check.

## Notes for AI

Use Antigravity CLI, not the Antigravity desktop orchestration application; RepoOS remains the task/worktree orchestrator. Prefer an explicit driver capability shape such as structuredOutput, resumableSession, modelDiscovery, and headlessWrite rather than CLI-name conditionals that imply every driver supports every feature. The Antigravity SDK and remote managed agents are out of scope for this local CLI integration. Add no runtime dependency. Avoid undocumented flags based only on similarity with Gemini CLI.

## Related

- #0043 — installed coding-agent detection
- #0083 — real CLI/model compatibility testing
- #0097 — task context packs and same-worktree resume context
- #0107 — audit recurring agent skill gaps

## Activity

- 2026-08-12T03:44:17Z · title, priority, area, branch, body
- 2026-08-12T17:51:28Z · status ready→inbox
- 2026-08-24T17:28:12Z · priority
- 2026-08-25T09:10:06Z · pm_model_override
