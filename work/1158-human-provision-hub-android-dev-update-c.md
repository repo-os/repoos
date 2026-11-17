---
id: "1158"
title: "Human: provision Hub Android dev update channel"
type: chore
status: inbox
needs_input: true
hold: true
priority: p1
area: [mobile, infra]
depends_on: ["1156"]
assigned_to: human
created_by: t@t
branch: ""
created_at: "2026-11-17T15:22:50Z"
updated_at: "2026-11-17T15:22:50Z"
---
## Step-by-step guide

This setup requires Nick's Cloudflare account and must be completed after task #1156 is reviewed/landed.

1. In Cloudflare, create an R2 bucket named `repoos-hub-dev-updates` in the same account used for the RepoOS site.
2. Attach the bucket to the custom domain `hub-dev-updates.repoos.org` and wait until Cloudflare reports it active. Do not enable public bucket listing. The public custom domain serves only objects whose names include the channel token.
3. Create a Cloudflare API token scoped to this account and bucket with R2 object read/write access. Store it in the normal local secret manager as `CLOUDFLARE_API_TOKEN`; never paste it into a task, chat, repository, or shell command.
4. Generate a random 32-byte channel path token locally (for example with `openssl rand -hex 32`) and save it as `REPOOS_HUB_DEV_UPDATE_TOKEN` in the gitignored `.repoos/dev-update-channel.env` file at the RepoOS checkout root. Use restrictive file permissions. Do not send the token to anyone or commit the file.
5. Confirm the normal Cloudflare Wrangler login/token configuration can access the bucket, then tell the engineer only that setup is complete (do not include either secret).
6. To rotate the channel path token later, replace the local value, publish a fresh APK and metadata under the new path, verify it on the phone, then remove the old token's objects. The app's next dev build receives the new path through the same ignored secret file.

## Scope

This task only provisions the account-owned bucket/domain and local secrets. Code and scripts are delivered by dependency task #1156. No secret values belong in this task.

## Human task

_Assigned to a human, not an AI agent. No `## Notes for AI` is required here; the acceptance criteria are the human's checklist._

## Activity

- 2026-11-17T15:22:50Z · created · t@t
