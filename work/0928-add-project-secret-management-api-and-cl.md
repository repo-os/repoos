---
id: "0928"
title: Add project secret management API and CLI
type: feature
status: active
human_step_decision: agent
human_step_decision_key: 10dfc9f8
priority: p1
area: [core, server, cli]
story: Secrets and project environments
depends_on: ["0927"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/add-project-secret-management-api-and-cl
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T08:06:03Z"
updated_at: "2026-10-22T15:32:55Z"
dev_error_count: 4
engineer_crash_log: "[{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-22T15:31:00.218Z\",\"kind\":\"dev-error\"},{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-22T15:31:06.314Z\",\"kind\":\"dev-error\"},{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-22T15:31:12.238Z\",\"kind\":\"dev-error\"},{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-22T15:32:51.919Z\",\"kind\":\"dev-error\"}]"
---
## Problem
The environment storage foundation in #0927 does not yet let an authorized user inspect or change project environment entries. Without an authenticated management surface, project values risk leaking through responses, logs, errors, or RepoOS internal credential settings.

## Desired UX
An authorized user can list environment/key metadata and explicitly add, replace, or remove a project value without ever reading an existing value back. The CLI lists metadata and accepts a new value from stdin or an interactive prompt, never from a command-line argument. Existing RepoOS provider/auth credentials keep their dedicated flows.

## Acceptance criteria
- Add authenticated, authorized server routes to list environment metadata and explicitly add, replace, and delete project entries using the storage primitives from #0927.
- Metadata responses contain key names, status, source, visibility, and non-sensitive concurrency information only; there is no reveal or recoverable-value response.
- Enforce role checks, origin/CSRF protection consistent with existing routes, no-store responses, and value-safe handling for errors, logs, audit events, and streamed events. Audit actor, environment, key name, action, and time without the value.
- Reserve internal RepoOS credential names from arbitrary project writes; keep existing fixed provider key names and dedicated save routes unchanged.
- Add CLI metadata listing and stdin/interactive add/replace/delete flows; do not accept secret values as flags or print them.
- Tests use unique fake sentinel values and assert they do not appear in response bodies, logs, emitted events, error text, or audit records; cover denial, CSRF/origin rejection, stale edits, and successful metadata mutations.
- No real secret, live account, or additional runtime dependency is required.

## Notes for AI
Build on the authentication/authorization, route, audit, and CLI patterns already in src/server and src/commands. Depends directly on #0927 for validated environment metadata and safe file operations. Do not implement the Secrets page or child-process environment binding here. Keep RepoOS infrastructure/provider credentials distinct from project-selected values and update directly affected API/security docs.

## Activity

- 2026-10-22T08:06:03Z · created · njachowski@gmail.com
- 2026-10-22T15:27:50Z · status inbox→ready
- 2026-10-22T15:27:57Z · cli_override, model_override
- 2026-10-22T15:27:59Z · status ready→active, branch
- 2026-10-22T15:28:04Z · message_queued at 2026-10-22T15:28:04.309Z
- 2026-10-22T15:30:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T15:31:00Z · agent exited with an error (codex) · 2026-10-22T15:30:59.808682Z ERROR codex_core::session: failed to record rollout items: thread 01a16439-f77e-7ce3-beb4-27b20d757766 not found
- 2026-10-22T15:31:00Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · 2026-10-22T15:30:59.808682Z ERROR codex_core::session: failed to record rollout items: thread 01a16439-f77e-7ce3-beb4-27b20d757766 not found
- 2026-10-22T15:31:02Z · message_delivered: 1 message(s)
- 2026-10-22T15:31:06Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · Reading additional input from stdin...
- 2026-10-22T15:31:12Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-22T15:32:51Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (4/3 crashes in 30m)
- 2026-10-22T15:32:55Z · needs_input
