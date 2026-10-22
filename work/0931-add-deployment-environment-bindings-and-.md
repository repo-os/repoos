---
id: "0931"
title: Add deployment environment bindings and production safeguards
type: feature
status: active
priority: p2
area: [server, web]
story: Secrets and project environments
depends_on: ["0929", "0930"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/add-deployment-environment-bindings-and-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T08:07:01Z"
updated_at: "2026-10-22T22:50:31Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-22T22:46:53.391Z: repoos check failed: the worktree changed while the gate was running (HEAD moved from 55c03c38 to 4d183313) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
---
## Problem
Deployments do not yet show or bind the project environment they consume. A local environment selection must not imply that its values were uploaded to a provider, and production must not be propagated implicitly when a deployment destination changes.

## Desired UX
A deployment clearly displays and explicitly selects its named environment. Users can distinguish local runtime injection from provider-managed variables. If a supported provider publish/sync operation is available, it presents the exact key-name diff and destination and requires an authorized explicit action; changing a deployment binding alone never publishes values.

## Acceptance criteria
- Add explicit environment binding and display to deployment configuration/operations, using the environment-selection and consumer model from #0930.
- Clearly distinguish values injected into local processes from variables managed by an external deployment provider; do not imply that selecting an environment uploads or synchronizes anything.
- If a provider already has a supported publish/sync operation, make it separately invoked and authorized, show a reviewable diff of key names and destination/scope before action, and never include plaintext in the diff. If no supported operation exists, deliver the binding/display and document that publishing is not supported rather than inventing an adapter.
- Tests use fake adapters to prove destination/scope, deletion behavior, authorization, and no accidental production propagation; changing a deployment or environment binding alone causes no external call.
- Any external-account verification, if truly required, is a separately identified human task dependent on this code task; the implementation and automated tests must not require a real account.
- No additional runtime dependency without explicit authorization.

## Notes for AI
Depends on #0929 for the Secrets UI and #0930 for scoped consumer bindings. Inspect current deployment targets/providers before choosing a UI or adapter. Keep explicit publish/sync distinct from local process injection; never silently send values to external systems. Update deployment documentation and tests.

## Shots
```json
[
{
"label": "Production environment binding",
"target": "default",
"route": "/deployments",
"highlight": ".dep-env-binding",
"state": "deployments:environmentBinding"
}
]
```

## Activity

- 2026-10-22T08:07:01Z · created · njachowski@gmail.com
- 2026-10-22T22:11:56Z · status inbox→ready
- 2026-10-22T22:12:02Z · cli_override, model_override
- 2026-10-22T22:12:03Z · status ready→active, branch
- 2026-10-22T22:12:07Z · message_queued at 2026-10-22T22:12:07.618Z
- 2026-10-22T22:12:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T22:14:41Z · body
- 2026-10-22T22:16:33Z · body
- 2026-10-22T22:16:45Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-22T22:16:45Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T22:16:45Z · message_delivered: 1 message(s)
- 2026-10-22T22:20:31Z · note: selector .dep-env-binding matched nothing on /deployments
- 2026-10-22T22:20:53Z · body
- 2026-10-22T22:23:09Z · body
- 2026-10-22T22:24:07Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T22:33:39Z · body
- 2026-10-22T22:34:54Z · body
- 2026-10-22T22:37:01Z · body
- 2026-10-22T22:47:47Z · note: Resuming after watchdog auto-surfaced task; rerunning stable handoff gate
- 2026-10-22T22:50:31Z · body
