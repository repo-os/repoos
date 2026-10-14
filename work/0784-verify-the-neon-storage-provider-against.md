---
id: "0784"
title: Verify the Neon storage provider against a live Neon account
type: chore
status: inbox
needs_input: true
needs_input_reason: needs-human-step
needs_input_detail: "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task. (matched: credentials or keys)"
hold: true
priority: p2
area: server
depends_on: ["0660"]
assigned_to: human
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-14T15:29:01Z"
updated_at: "2026-10-14T15:30:08Z"
---
## Problem
#0660 added the Neon Object Storage provider. It has hand-rolled SigV4 signing, env-based credentials and a registry fallback, but it is tested only against a fake transport. The task was flagged needs-human-step because proving it works needs real Neon credentials, which only a human can provide. This task holds that human-only part, split out so #0660's code could land.

## Desired UX
An administrator sets the Neon credentials from user-docs/environment-and-secrets.md, selects Neon as the storage provider in Settings, and attachments upload, download and delete against a real Neon bucket.

## Acceptance criteria
- Human: create or choose a Neon Object Storage bucket and set the credentials as documented in user-docs/environment-and-secrets.md (env/secrets, never committed config).
- Human: select Neon in Settings, then upload a task screenshot, view it, and delete the task. Confirm that the object appears and is removed in the Neon console.
- Record the result in this task: SigV4 accepted or rejected, the region and endpoint used, and any error text.
- Any defect found becomes a separate AI task. Do not fix it here.

## Notes for AI
Human-only verification. Do not start it as an engineer. Two non-blocking review suggestions from #0660 fit a small AI follow-up, not this task: check the HTTP status of DeleteObjects in deleteBatch/removeNamespace, and add a line on request-rate limits to docs/neon-object-storage.md.

## Activity

- 2026-10-14T15:29:01Z · created · njachowski@gmail.com
- 2026-10-14T15:29:02Z · needs_input
- 2026-10-14T15:30:08Z · held, assigned_to
