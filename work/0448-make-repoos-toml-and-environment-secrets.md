---
updated_at: "2026-09-19T22:13:50Z"
review_passes: 4
id: "0448"
title: Make repoos.toml and environment secrets documentation complete
type: docs
status: review
priority: p1
area: docs
assigned_to: ai
created_by: ""
branch: feat/make-repoos-toml-and-environment-secrets
cli_override: opencode
model_override: openrouter/deepseek/deepseek-v4.1-flash
review_cli_override: cursor
review_model_override: auto
created_at: "2026-09-19T15:10:29Z"
review_rounds: 2
handoff_signal_retry_count: 1
dev_error_count: 1
---
## Outcome

Give users one trustworthy explanation of every supported RepoOS project setting and every supported secret/runtime setting, without teaching internal test or reload variables as normal configuration.

## Scope

- Turn the existing Configuration page into the definitive repoos.toml reference, organized by layout/board, server/UI, worktrees/runtime, agents, previews/checks, auth, releases/deployments/distribution, notifications, tunnels, and remote validation.
- For each supported field, document type, default, whether it is committed, user-visible effect, constraints, and a realistic example. Keep task-specific guides linked out rather than duplicating them.
- Add an Environment and secrets page for the gitignored repo-root .env and machine/service environment: model-provider credentials, auth secrets, Cloudflare/Hetzner/SSH infrastructure credentials, precedence, rotation, and safe .env.example placeholders.
- Explain that machine/service environment is appropriate for a machine-wide provider key, while repo .env is appropriate for project-specific secrets; no key belongs in repoos.toml.
- Document worktree env inheritance precisely: it is off by default and must be opted into deliberately.
- Clearly separate user-supported REPOOS_* overrides from internal process/test/reload variables that users should not place in .env.
- Prefer a generated or schema-verified reference so docs cannot drift from the config types and parser.

## Acceptance criteria

- A new user can answer what a repoos.toml field does without reading source.
- The docs include a complete annotated starter repoos.toml and safe .env.example.
- Secret examples contain placeholders only; no live values or misleading copied env names.
- Existing authentication, provider, runtime, and worktree docs link to the new reference rather than contradicting it.
- The docs build and all internal links resolve.

## Activity

- 2026-09-19T15:10:29Z · created · unknown
- 2026-09-19T15:20:41Z · review_cli_override, review_model_override
- 2026-09-19T15:20:42Z · review_cli_override
- 2026-09-19T15:27:46Z · status inbox→ready
- 2026-09-19T15:27:48Z · status ready→active, branch
- 2026-09-19T15:53:05Z · agent exited with an error (copilot) · permission problem, not a code failure: GitHub Copilot denied a shell command that isn't on RepoOS's --allow-tool list
- 2026-09-19T15:58:40Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-19T16:01:52Z · cli_override
- 2026-09-19T16:01:54Z · model_override
- 2026-09-19T16:02:19Z · cli_override, model_override
- 2026-09-19T16:02:33Z · model_override
- 2026-09-19T16:02:42Z · needs_input
- 2026-09-19T16:35:18Z · status active→review
- 2026-09-19T16:38:04Z · status review→active
- 2026-09-19T16:54:49Z · status active→review
- 2026-09-19T17:09:49Z · needs_input
- 2026-09-19T17:10:23Z · review_cli_override
- 2026-09-19T17:10:25Z · review_model_override
- 2026-09-19T17:11:23Z · review_cli_override, review_model_override
- 2026-09-19T17:11:27Z · review_model_override
- 2026-09-19T17:13:34Z · needs_input
- 2026-09-19T17:13:34Z · status review→active
- 2026-09-19T17:31:06Z · status active→review


