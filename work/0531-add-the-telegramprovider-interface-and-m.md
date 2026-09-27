---
id: "0531"
title: Add the TelegramProvider interface and manager-bot project bot provisioning
type: feature
status: inbox
priority: p1
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-27T07:32:10Z"
updated_at: "2026-09-27T07:32:10Z"
---
## Problem

Story #0003 mandates "one manager bot, one project bot per repository" as the default model, and specifies a `TelegramProvider` interface. Nothing in the codebase can accept that interface yet: the only outbound notification path is ntfy, and it is a set of hardcoded free functions (`src/server/ntfy.ts`, 10 exports, no interface, no registry, no seam). The provider abstraction has to be introduced before the Telegram bot can be provisioned or configured, and it is the reason the transport can later change between webhook and polling.

## What to build

The interface from the story definition, with both transports behind it:

```ts
interface TelegramProvider {
  provisionBot(): Promise<ProvisionedBot>;
  configureBot(bot: ProvisionedBot): Promise<void>;
  sendMessage(chatId: string, message: TelegramMessage): Promise<void>;
  handleUpdate(update: TelegramUpdate): Promise<void>;
}
```

- Two transports: **self-hosted** (the instance's own `setWebhook`, or long polling) and **hosted/central** (a service receives updates centrally and routes to the right instance). Selection must be configuration, never a hardcoded choice, so the transport is swappable later as the story requires.
- `provisionBot` drives the managed-bot flow: the RepoOS manager bot has Bot Management Mode enabled and creates a project bot via the deep link `https://t.me/newbot/RepoOSManager/<name>?name=<display+name>`. The manager bot receives the managed-bot update and the RepoOS service retrieves the new token.
- `configureBot` sets bot commands, description/profile info, group permission behavior (privacy mode stays **on**), and webhook or polling mode.

## Manager bot token handling — the hard constraint

- The manager bot token lives **only** in the provisioning service or secure server environment. It must never be written into an individual repository, never appear in `repoos.toml`, and never be returned to a browser. Env-only, following `REPOOS_AUTH_DEV_BACKDOOR_CODE` (env var, no TOML key, never honored under `NODE_ENV=production`).
- Project bot tokens are stored via the encrypted secret store, and are **never** written into ordinary repository files. `.env` is a working fallback for the self-hosted bring-your-own-token path, but it is plaintext on disk and worktree inheritance can copy it — prefer the encrypted store.
- The manager bot provisions and manages only. It does **not** process each project's messages. Each project bot talks directly to its own RepoOS instance, which preserves the decentralized "one server, one repository" model.

## Bring Your Own Bot Token

The story's design decision also requires a manual path for self-hosted/enterprise installs that do not want RepoOS provisioning a bot. Both modes must produce the same internal `ProvisionedBot` shape so nothing downstream branches on which was used.

## Done when

- `provisionBot` / `configureBot` work end-to-end against a project bot in both modes, and the same interface serves a manually supplied token.
- Tests assert the manager token is absent from config, from every HTTP response, and from the repository directory.
- Switching transports requires no change above the provider interface.

## Activity

- 2026-09-27T07:32:10Z · created · unknown
