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
updated_at: "2026-11-17T16:19:27Z"
---
## Step-by-step guide
This setup requires Nick's Cloudflare account. Complete it after task #1156 lands on main.

1. In Cloudflare, create a private R2 bucket named `repoos-hub-dev-updates` in the same account used for the RepoOS site. Do not attach the bucket directly to a public custom domain and do not enable public listing; only the Worker should read the bucket.
2. In `mobile/dev-update-worker/wrangler.jsonc`, confirm the R2 bucket binding and the route `hub-dev-updates.repoos.org/*` use the RepoOS Cloudflare zone. In DNS, create/enable the proxied hostname required for the Worker route. Deployments must serve through the Worker, which checks the token and sends `X-Robots-Tag: noindex, nofollow, noarchive` and CORS headers.
3. Create a Cloudflare API token scoped to the RepoOS account with permission to deploy Workers, update Worker secrets, manage the `repoos-hub-dev-updates` R2 bucket, and inspect the zone route. Save the account ID and token in your private secret manager; never put either value in a task or chat.
4. Generate the channel path token once with a local secure random generator, for example `openssl rand -hex 32`. Save `REPOOS_HUB_DEV_UPDATE_TOKEN=<value>`, `CLOUDFLARE_API_TOKEN=<value>`, and `CLOUDFLARE_ACCOUNT_ID=<value>` in `.repoos/dev-update-channel.env` at the RepoOS checkout root. Set file permissions to owner read/write only. Do not print the values or commit the file.
5. In the GitHub repository's Settings → Secrets and variables → Actions → Repository secrets, add exactly these three secrets: `REPOOS_HUB_DEV_UPDATE_TOKEN`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ACCOUNT_ID`. Use the same values as the local secret file. Never paste secret values into issues, task files, chat, or logs.
6. After a push to main, confirm the “Publish Hub Android dev build” workflow succeeds. Its first run deploys the Worker, stores the channel token as a Worker secret, builds the `.dev` APK and publishes the APK plus `latest.json` to the private R2 bucket.
7. On the phone, open RepoOS Hub Dev on mobile data. Confirm the update prompt appears for a newer commit, choose Download now, approve Android's install prompt, and verify the app opens with its existing server data intact. Confirm Settings → Dev updates shows the installed commit and Check now works. Report only whether each check passed; do not send secret values.
8. To rotate the path token, generate a replacement locally, update the local file and the matching GitHub secret, let the workflow deploy the new Worker secret and publish a build containing the new token, install that build, then delete old channel objects. Do not put either token in the task.


## Scope

This task only provisions the account-owned bucket/domain and local secrets. Code and scripts are delivered by dependency task #1156. No secret values belong in this task.

## Human task

_Assigned to a human, not an AI agent. No `## Notes for AI` is required here; the acceptance criteria are the human's checklist._

## Activity

- 2026-11-17T15:22:50Z · created · t@t
- 2026-11-17T16:19:27Z · body: Step-by-step guide (added 9, removed 7)
