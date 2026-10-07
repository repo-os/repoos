---
id: "0735"
title: "Easter eggs bundle: runner state, root-cause docs, and SHA assertion"
type: chore
status: inbox
priority: p2
area: [server, web]
assigned_to: ""
created_by: hello@repoos.org
branch: ""
created_at: "2026-10-07T09:29:29Z"
updated_at: "2026-10-07T09:29:29Z"
---
## Problem
Driver verification on 2026-10-07 found three small, independent follow-ups while landing #0727/#0729. Keep them out of the release-critical machinery branch.

## Desired UX
1. #0711/#0727: done-guard-orchestrator.test.ts must compare the parsed merged_commit value, not literal unquoted YAML. Current main assertion expected merged_commit: 00aef... while the writer correctly emitted a quoted SHA. Preserve the actual branchSha semantic guarantee.
2. #0729: publish in-flight hung state when the watchdog starts targeted container kill. onHung currently calls runRemote(killContainerCommand), but pool.markHung happens only after the terminal result. Ensure the real Remote runners badge shows hung/killing while kill is pending, then records history and clears active state.
3. #0729: docs/remote-validation.md should distinguish confirmed startup sweep deleting live workdirs from unproven shared-cache corruption. Preserve historical incident facts, explain cache isolation as preventive protection and own-run EXIT cleanup versus future safe GC.

## Acceptance criteria
- One behavioral regression per item: quoted/unquoted SHA parsing still equals branchSha; delayed kill promise exposes in-flight hung flag then terminal state; scoped docs checks and root-cause wording match current implementation/evidence.
- Commit each item separately for review. Normal check, review, and server-owned close-out; do not weaken gates or touch owner config/hosts.

## Notes for AI
Independently verify against current main and running build before implementing, especially any cross-repo reports. Source evidence is driver log overnight-log-2026-10-06.md in opex docs, #0727 remote log thinkpad09:11Z assertion (correct SHA quoted), #0729 final reviewer09:27:31Z and onHung/markHung call sites. Areas server,web are existing vocabulary. Wait until #0729 lands; this is p2 follow-up, not a release blocker. No production screenshot fixtures. Bundle convention applies: three low-impact runner/close-out follow-ups, one focused worktree, one scoped check, one review, one close-out.

## Activity

- 2026-10-07T09:29:29Z · created · hello@repoos.org
