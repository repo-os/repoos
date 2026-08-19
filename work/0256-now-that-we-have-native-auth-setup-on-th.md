---
id: "0256"
title: Simplify Cloudflare publishing now that native auth is built in
type: refactor
status: inbox
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: ""
model_override: default
pm_model_override: default
created_at: "2026-08-19T13:04:26Z"
updated_at: "2026-08-19T13:18:50Z"
---
## Problem

Cloudflare Tunnel publishing currently requires the user to provide an email
whitelist and provisions a Cloudflare Access policy to gate every published app.
With native email auth now built into the RepoOS server (task #0246), the
Cloudflare Access layer is redundant as the primary auth gate — native auth
already controls who can log in. Requiring users to maintain a separate email
list at the Cloudflare level adds friction and confuses the distinction between
the two layers.

## Desired UX

Publishing a Cloudflare Tunnel works without being forced to supply an email
whitelist. The user can optionally add one for defense-in-depth, but the default
flow is: publish the tunnel, enable native auth on the server, and you're done.
The UI and CLI no longer treat the email list as a required field.

## Acceptance criteria

- [ ] `repoos tunnel create` no longer requires `--allow` emails; omitting it
      creates a published app without a Cloudflare Access policy.
- [ ] `repoos tunnel create --allow alice@example.com` still works for users
      who want an explicit Access layer.
- [ ] The CLI help text for `tunnel create`, `allow`, and `deny` no longer
      implies the email list is mandatory.
- [ ] The TunnelDrawer UI form no longer requires at least one email address;
      the email field is optional (can be left blank or removed).
- [ ] `buildTunnelPublishPlan()` in `tunnel-assistant.ts` works with an empty
      email list — no validation error, no `--allow` flag in generated commands
      when emails are empty.
- [ ] `validateTunnelPublishInput()` does not reject empty email lists.
- [ ] `reconcileAccessPolicy()` is only called when there are emails to apply;
      skipped entirely when the list is empty.
- [ ] The `authNote` in the plan output is updated: native auth is the primary
      access control; Cloudflare Access is optional defense-in-depth.
- [ ] `TunnelApp.access` in the data model gracefully handles empty/missing
      arrays without breaking parsing, serialization, or the Access API calls.
- [ ] All existing tunnel tests pass; new tests cover the no-email default path.
- [ ] `repoos check` passes.

## Notes for AI

- Touch points span four layers:
  - **Data model**: `src/core/tunnel.ts` — `TunnelApp.access` field, `parseTunnelSection`, `serializeTunnelSection`, email utilities, `buildAccessPolicyBody`
  - **CLI**: `src/commands/tunnel.ts` — `cmdTunnelCreate`, `mutateAllowlist`, help text, `reconcileAccessPolicy` guard
  - **UI assistant**: `src/core/tunnel-assistant.ts` — validation and plan building
  - **Vue UI**: `src/ui-app/src/components/TunnelDrawer.vue` — form field and validation
- Do NOT remove the Cloudflare Access integration entirely — it remains a valid
  optional layer. Only make it non-required.
- Do NOT change how native auth works — that's done (#0246).
- Do NOT modify the Cloudflare Tunnel creation/DNS-routing logic.
- When a user has `auth.enabled = true` in `repoos.toml` and publishes without
  an email list, the tunnel is protected by native auth alone — this is the
  intended safe default.

## Scope

In scope: making the Cloudflare Access email whitelist optional across CLI, UI,
and data model. Updating validation, help text, and assistant output.

Out of scope: changes to the native auth system itself, Cloudflare Tunnel/DNS
plumbing, or removing existing Cloudflare Access support.

## Related

- #0246 (native email auth — prerequisite, completed)
- `docs/native-auth.md` (explains the two-layer model)

## Original prompt

now that we have native auth setup on the server let's simplify the cloudflare publishing so that it doesn't ask for email whitelist there anymore, and anythign else that's not necessary now that we have the new email auth built into the server

## Activity

- 2026-08-19T13:07:06Z · status draft→inbox, title, area, type, body
- 2026-08-19T13:18:50Z · model_override
