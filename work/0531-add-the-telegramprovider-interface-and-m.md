---
id: "0531"
title: Add the local Telegram adapter and Bring Your Own Bot Token support
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "error: Rate limit exceeded. Please try again later."
priority: p1
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: feat/add-the-local-telegram-adapter-and-bring
cli_override: opencode
model_override: opencode-go/glm-5.3-flash
review_model_override: opencode-go/space-bunny-free
created_at: "2026-09-27T07:32:10Z"
updated_at: "2026-09-27T18:39:45Z"
dev_error_count: 1
---
## Problem

Story #0003 needs a local Telegram adapter before webhook intake, identity linking, notifications, Settings, or agent commands can use a project bot. This task was split: local integration remains here; the official manager-bot provisioning service and secure token handoff live in #0559.

## What to build

Define the shared TelegramProvider and ProvisionedBot / TelegramMessage / TelegramUpdate shapes needed by later tasks. Keep provisioning, bot configuration, message delivery, and update handling behind explicit interfaces so future integration does not require parallel implementations.

- Implement the local Bring Your Own Bot Token path first. Accept a token server-side, validate the bot identity with Telegram, and store/retrieve the credential through #0530's encrypted secret store. Never fall back to plaintext .env storage for imported credentials.
- Configure the project bot's supported commands, description/profile information, and update transport. Preserve group privacy mode; verify current Telegram support and document operator-only settings rather than claiming unsupported API toggles.
- Send messages through Telegram's Bot API and normalize incoming updates for the downstream intake/authorization/command pipeline. This task supplies the adapter, not the later command implementations or authorization policy.
- Support self-hosted webhook and long-polling modes behind a transport boundary. Webhook route authentication belongs to #0532; user identity, live authorization, and chat routing belong to #0533–#0535. Until those exist, no incoming update may trigger an agent or disclose repository data.
- Define a narrow client boundary for managed provisioning via #0559: begin a request, inspect its state, and redeem the project credential server-to-server. #0559 supplies the service and real secure handoff. Document the contract and use a fake service in tests here; this task must not require a hosted deployment to finish.
- BYO and managed provisioning ultimately return the same ProvisionedBot shape. If the managed service is unavailable or not yet configured, report that honestly and keep BYO functional. No manager-bot credential is ever accepted or stored by a repository instance.
- Any configuration introduced here must follow AGENTS.md: user-facing non-secret settings get schema entries, Settings controls, docs, and tests in the same change. Coordinate with #0538 for the full connection-management UI; do not leave new feature toggles raw-TOML-only. Credentials remain outside TOML and never appear in browser responses.

## Security and architecture

Use ADR 0007 for identity and authorization. Project tokens must remain encrypted at rest through #0530 and redacted from logs, errors, URLs exposed to clients, HTTP responses, and support bundles. Normal project messages go directly between Telegram and the local RepoOS server, preserving one server per repository. Hosted/central message relaying is outside this task; retain an extension boundary rather than deploying that transport now. Add no runtime dependencies to RepoOS.

## Done when

- A real BYO project bot can be validated, configured, and used by the local adapter, without a manager service or BotFather automation.
- Webhook and polling adapters normalize updates consistently; transport switching does not change code above the adapter.
- Tests cover token validation failures, encrypted storage, redacted errors, missing credentials, API failures, and managed-service unavailability.
- The provisioning client contract is documented and tested with a fake service; #0559 owns its deployed end-to-end implementation.
- Manager credentials never enter the repository; project credentials never reach the browser.
- Relevant docs and required configuration controls are updated, and repoos check passes.

## Dependencies and scope

Depends on #0530 (done). #0533 can run alongside this task with agreed bot/linking types. #0532, #0535, #0537, and #0538 consume this adapter. #0559 follows once the provisioning client contract is stable and its hosting choice is settled.

Not in scope: the manager-bot service, its Neon/Cloudflare deployment, hosted message relay, user/chat linking, notification registry, agent chat, or task lifecycle commands. Those have separate tasks. The story's automatic provisioning acceptance criterion is completed by #0559, not removed.

## Activity

- 2026-09-27T07:32:10Z · created · unknown
- 2026-09-27T07:34:11Z · status inbox→ready
- 2026-09-27T17:33:19Z · title, body
- 2026-09-27T18:36:45Z · cli_override, model_override
- 2026-09-27T18:36:48Z · model_override
- 2026-09-27T18:36:58Z · review_model_override
- 2026-09-27T18:37:00Z · status ready→active, branch
- 2026-09-27T18:38:40Z · agent exited with an error (opencode) · error: Rate limit exceeded. Please try again later.
- 2026-09-27T18:39:31Z · model_override
- 2026-09-27T18:39:45Z · model_override
