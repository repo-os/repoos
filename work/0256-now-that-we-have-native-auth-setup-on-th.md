---
id: "0256"
title: Simplify Cloudflare publishing now that native auth is built in
type: refactor
status: review
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/simplify-cloudflare-publishing-now-that-
model_override: default
pm_model_override: default
created_at: "2026-08-19T13:04:26Z"
updated_at: "2026-08-19T18:03:11Z"
---
## Problem

Cloudflare Tunnel publishing used to require the user to provide an email
whitelist and provisioned a Cloudflare Access policy to gate every published
app. With native email auth now built into the RepoOS server (task #0246),
RepoOS no longer supports Cloudflare Access at all — native auth is the only
access gate RepoOS manages for published tunnels.

## What changed

An initial pass made the Access email allowlist optional rather than
required, but kept the entire Cloudflare Access integration in place
(API token storage, policy reconciliation, `allow`/`deny` commands) gated
behind conditionals — a lot of surface area for a feature that's no longer
wanted. Scope was corrected to a full removal:

- `repoos tunnel create` no longer accepts `--allow`; there is no email
  concept in tunnel apps at all.
- Removed `tunnel allow` / `tunnel deny` subcommands entirely.
- Removed the Cloudflare Access API client (`cfFetch`, `reconcileAccessPolicy`,
  `findAccessApp`, `findAccessPolicy`) and the Cloudflare API token keychain
  storage — RepoOS never touches a Cloudflare API token anymore.
- `TunnelApp` no longer has an `access` field; `repoos.toml` no longer
  serializes one.
- `TunnelDrawer.vue` no longer has an email input or a "Cloudflare token
  permissions" panel; the readiness panel no longer shows `apiTokenStored`.
- `docs/native-auth.md`'s Cloudflare Access section was rewritten to say
  RepoOS doesn't manage Access — users who want it can configure it directly
  in the Cloudflare dashboard.
- `repoos tunnel create` now just publishes the app; the printed next step
  points at enabling `auth.enabled = true` for access control.

Net: -470 lines across core/tunnel.ts, commands/tunnel.ts,
core/tunnel-assistant.ts, TunnelDrawer.vue, server.ts, and tests.

## Acceptance criteria

- [x] \`repoos tunnel create\` never asks for or accepts an email whitelist.
- [x] The CLI help text for \`tunnel create\` no longer mentions \`--allow\`,
      \`allow\`, or \`deny\`.
- [x] The TunnelDrawer UI form has no email field.
- [x] \`buildTunnelPublishPlan()\` in \`tunnel-assistant.ts\` never generates
      an \`--allow\` flag.
- [x] \`TunnelApp\`/\`repoos.toml\` no longer has an \`access\` field.
- [x] All tunnel tests pass; tests updated to match the no-Access behavior.
- [x] \`repoos check\` passes (build, typecheck, full test suite all green).

## Notes for AI

- Touch points spanned: \`src/core/tunnel.ts\`, \`src/commands/tunnel.ts\`,
  \`src/core/tunnel-assistant.ts\`, \`src/ui-app/src/components/TunnelDrawer.vue\`,
  \`src/server/server.ts\` (readiness route's \`apiTokenStored\`/token check),
  \`docs/native-auth.md\`.
- Cloudflare Tunnel/DNS-routing logic (cloudflared login/create/route dns)
  is untouched — only Access management was removed.

## Original prompt

now that we have native auth setup on the server let's simplify the cloudflare publishing so that it doesn't ask for email whitelist there anymore, and anythign else that's not necessary now that we have the new email auth built into the server

Follow-up (2026-08-20): we no longer will use/support Cloudflare Access/Zero
Trust at all, so fully remove the integration rather than just making the
email whitelist optional.

## Activity

- 2026-08-19T18:03:11Z · body
