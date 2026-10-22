---
id: "0931"
title: Add deployment environment bindings and production safeguards
type: feature
status: inbox
priority: p2
area: [server, web]
story: Secrets and project environments
depends_on: ["0929", "0930"]
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-22T08:07:01Z"
updated_at: "2026-10-22T08:07:01Z"
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

## Activity

- 2026-10-22T08:07:01Z · created · njachowski@gmail.com
