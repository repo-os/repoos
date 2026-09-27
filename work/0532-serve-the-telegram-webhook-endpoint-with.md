---
id: "0532"
title: Serve the Telegram webhook endpoint with secret validation
type: feature
status: ready
priority: p1
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-27T07:32:19Z"
updated_at: "2026-09-27T07:34:12Z"
---
## Problem

Every project bot needs a way to deliver updates. In the hosted model a central service receives them and routes; in the self-hosted model the instance exposes a webhook. Either way RepoOS ends up with an **inbound webhook that must be publicly reachable and must authenticate its caller** — and that mechanism does not exist anywhere in this codebase today.

A grep for `webhook` across `src/**/*.ts` returns exactly one hit: a regex in the redaction ruleset (`src/core/redact.ts:104`). There is no inbound machine-auth path other than Hub capabilities, and Hub capabilities cannot be reused directly because they are bearer tokens checked against `auth_hub_capabilities`, with only read scopes (`summary:read`, `search:read`).

## The trap that makes this non-obvious

Auth is enforced by a **central middleware that runs before route dispatch** (`src/server/server.ts:2614-2671`). When `auth.enabled` is true, anything not matching `PUBLIC_PREFIXES` (`/api/health`, `/api/auth/`, `/api/hub/v1/summary`, `/api/hub/v1/tasks/search`) or `PUBLIC_PATHS` gets a `401`, with browser navigations redirected to `/login`.

So the webhook must be added to `PUBLIC_PREFIXES` — **but the middleware has not run by the time dispatch happens.** Making the route public is what allows the request in; the route's own secret check is the only thing standing between the public internet and a repository's task data. Validate the secret **first**, before parsing the body or touching any state.

## What to build

- Validate Telegram's `X-Telegram-Bot-Api-Secret-Token` on every request, compared with `timingSafeEqualStr` (`src/core/auth.ts:67`) — the same constant-time comparison the auth system already uses. Never `===` on a secret, never log the header, never echo it in an error.
- Fail closed on a missing or mismatched secret with a generic `403` that leaks nothing about which check failed.
- The secret is set on the bot via `setWebhook` when the webhook is configured, and stored with the other Telegram credentials (encrypted, env-sourced).
- Resolve which project an update belongs to from the webhook path/secret mapping, not from a client-supplied field in the body.
- Reject oversized bodies before parsing; Telegram updates are small and an unbounded body on a public route is a denial-of-service surface.
- The route hands the update to `TelegramProvider.handleUpdate` and returns promptly — Telegram retries on a slow response, so slow work belongs off the request path.

## Done when

- Valid secret is accepted; missing, wrong, and truncated secrets are all rejected without distinguishing detail in the response or logs.
- A test proves an unauthenticated request cannot reach any task, agent, or config data through this route.
- The middleware ordering is documented in a comment at the `PUBLIC_PREFIXES` entry, since it is the kind of thing a future edit silently breaks.

## Activity

- 2026-09-27T07:32:19Z · created · unknown
- 2026-09-27T07:34:12Z · status inbox→ready
