---
id: "0932"
title: Verify secrets security boundaries and complete user documentation
type: chore
status: inbox
priority: p1
area: [docs, server, core]
story: Secrets and project environments
depends_on: ["0928", "0929", "0930", "0931"]
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-22T08:07:24Z"
updated_at: "2026-10-22T08:07:24Z"
---
## Problem
The individual environment, API, UI, process-binding, and deployment slices must be verified together so no integration path leaks values or grants unintended production access. Current environment documentation describes the legacy model and will need a precise update once named project environments ship.

## Desired UX
Users can understand what values are stored where, which local consumers receive them, what the protection model does and does not enforce, and why file-backed storage is not an encrypted vault. They can rely on the documented distinction between project secrets and RepoOS provider/auth/infrastructure credentials.

## Acceptance criteria
- Add integration-level security tests across the completed work in #0928 through #0931 for role denial, origin/CSRF behavior, no-store cache behavior, secret leakage through errors/logs/events/support bundles/transcripts, tracked-file refusal, missing keys, and agent/worktree/remote access boundaries.
- Use unique fake sentinel values and prove none appear in metadata responses, errors, logs, events, support output, task context, or screenshots; do not use real secrets or accounts.
- Verify environment selection and deployment binding do not fall back to production or implicitly publish values, and that two targets bound to distinct environments remain isolated.
- Update docs/api-keys.md, user-docs/environment-and-secrets.md, configuration docs, and directly affected AGENTS.md rules consistently; explain plaintext file backing honestly, write-only v1 behavior, exposure limits for unrestricted local processes, visibility prefixes, explicit grants, legacy behavior, and absence of implicit provider sync.
- Run the scoped RepoOS check for changed paths and fix any documentation links/tests introduced by this task.
- No new runtime dependency or human-only verification is required.

## Notes for AI
Depends directly on #0928, #0929, #0930, and #0931; those implementation slices each own their local tests, docs, and check. This task verifies cross-slice behavior and fills user-facing documentation gaps rather than deferring basic safeguards. Do not change existing provider credential flows governed by docs/api-keys.md; clarify their boundary with application environments.

## Activity

- 2026-10-22T08:07:24Z · created · njachowski@gmail.com
