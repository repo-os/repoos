---
merge_conflict_retry_count: 1
updated_at: "2026-09-28T05:38:57Z"
review_passes: 1
id: "0538"
title: "Add Telegram settings, connection status, and test-message controls"
type: feature
status: review
priority: p1
area: web
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: feat/add-telegram-settings-connection-status-
cli_override: github copilot
model_override: copilot-auto-balance
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-09-27T07:33:10Z"
---
## Problem

The story's Phase 1 ends with "Add connection status and test-message controls," and its first provisioning step is "An administrator opens RepoOS Settings and selects *Connect Telegram*." Without this, an administrator has no way to start provisioning or confirm it worked.

This is also where a hard repo rule applies: **every user-facing `repoos.toml` feature setting needs a `getConfigSchema()` entry, a Settings tab control, and a test.** `src/ui-app/tests/config-docs.test.ts` fails the gate on any `SUPPORTED_TOML_KEYS` entry lacking documentation. The ntfy panel is the template to follow: `src/ui-app/src/views/SettingsView.vue:953-1020`, tab key mapping at `:58-59`, test button at `:421`.

## What to build

- **Connect Telegram** — starts provisioning for this repository: creates the short-lived signed linking request (repository identity, instance identity, expiry, random nonce), then opens or displays the managed-bot deep link. Must be admin-gated via the existing `requireAdmin` pattern (`src/server/routes/auth.ts:85`), not merely hidden in the UI.
- **Connection status** — connected / not connected, bot display name and username, and the chats currently bound. **Status only: never a token.** The browser must not be able to read a bot token back at any point after provisioning, per the story's security requirements.
- **Test message** — sends a real notification to a chosen bound chat, so an admin can verify the integration before relying on it. Failures surface the actual Telegram error, since "it didn't arrive" is otherwise undiagnosable.
- **Manage bound users and chats** — list linked Telegram users against their emails and roles, revoke a link, unbind a chat. These are the visible surface of the auth model, and they must reflect live `auth_users` state rather than a cached copy, so a user demoted or removed in Authentication & Users shows their new status here immediately.
- **Bring Your Own Bot Token** — the manual path from the story's design decision, for installs that do not want RepoOS provisioning a bot.

## Config treatment — decide explicitly

- Non-secret toggles get `repoos.toml` keys plus the schema entry, panel control, and docs.
- **Secrets stay env-only, with no TOML key**, following `REPOOS_AUTH_DEV_BACKDOOR_CODE` — the existing precedent for a credential that must never reach a git-tracked file or a client.
- Decide deliberately whether Telegram config is **restart-tier** like `[auth]` (documented in `docs/native-auth.md:33-36`) or live-reloadable via `patchTomlConfig`. A token rotation that needs a server restart is a poor experience for a self-hosted user; a change that claims to be live but is only read at boot is worse. Pick one and write down why.

## Conventions

Use the shared dialog components (`ui/dialog/*`, body-teleported) and the global form classes in `src/ui-app/src/style.css` — `field`, `btn-row`, `ff-textarea`, `ff-notice`, `ff-error` — rather than bespoke styling in a `<style scoped>` block. Any `position: fixed` or fullscreen overlay **must** be wrapped in `<Teleport to="body">` or a Radix `DialogPortal`, or it will be trapped in the drawer's stacking context and become unscrollable and unclickable. Dropdowns use the custom styled component, never a bare `<select>`.

## Done when

- An admin can go from no integration to a provisioned, configured, testable bot without touching BotFather.
- No token is reachable from the browser in any state, asserted by test.
- A new `repoos.toml` key without a schema entry, a control, and docs fails the gate.

## Activity

- 2026-09-27T07:33:10Z · created · unknown
- 2026-09-27T07:34:18Z · status inbox→ready
- 2026-09-27T15:42:34Z · body
- 2026-09-27T15:51:54Z · body
- 2026-09-27T15:52:45Z · body
- 2026-09-28T00:02:22Z · status ready→active, branch
- 2026-09-28T00:02:37Z · status active→ready
- 2026-09-28T05:09:39Z · cli_override, model_override
- 2026-09-28T05:09:40Z · model_override
- 2026-09-28T05:09:46Z · review_cli_override, review_model_override
- 2026-09-28T05:09:47Z · review_model_override
- 2026-09-28T05:09:47Z · status ready→active
- 2026-09-28T05:37:50Z · status active→review


