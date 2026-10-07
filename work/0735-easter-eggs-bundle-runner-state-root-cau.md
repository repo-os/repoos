---
id: "0735"
title: "Easter eggs bundle: runner state, root-cause docs, and SHA assertion"
type: chore
status: review
priority: p2
area: [server, web]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/easter-eggs-bundle-runner-state-root-cau
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T09:29:29Z"
updated_at: "2026-10-07T10:55:43Z"
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

## Owner fix to transfer (2026-10-07)
Owner explicitly authorizes transferring the uncommitted .github/workflows/certify-harnesses.yml fix into this Easter eggs bundle. Exact patch preserved /private/tmp/repoos-owner-certify-harnesses.patch; exact full file /private/tmp/repoos-owner-certify-harnesses.yml. Apply the patch FIRST to this dedicated task worktree, commit as its own item preserving owner content. This removes invalid job-level matrix condition and uses Select harness step plus step-level guards. Add meaningful regression validation: scheduled/empty input runs each harness; targeted input runs matching harness only; nonmatching harness performs no checkout/install/certify/manifest/PR steps. Prefer existing workflow-validation tooling, do not run external workflow or open PR. Independently inspect correctness before modifying the owner fix; preserve evidence. Driver will verify byte-for-byte transfer before reverting ONLY transferred file on main. Engineer must never edit main. Continue original three bundle items after transfer; current-main/build relevance verification, no host/config/restart, one scoped check, normal review/MTD.

## Activity

- 2026-10-07T09:29:29Z · created · hello@repoos.org
- 2026-10-07T10:31:21Z · body
- 2026-10-07T10:31:33Z · cli_override, model_override
- 2026-10-07T10:32:24Z · status inbox→ready
- 2026-10-07T10:33:22Z · status ready→active, branch
- 2026-10-07T10:33:24Z · note: Update: owner fix has now landed on current main as bf082a33c Fix deploy. Exact current certify-harnesses.yml byte-for-byte matches /private/tmp/repoos-owner-certify-harnesses.yml. Do NOT apply saved patch again or duplicate the fix. Verify current-main workflow correctness; keep meaningful missing regression only if needed and original three bundle items. npm publishing occurs in separate release.yml; do not claim this certification filter fixes npm publishing without failure evidence.
- 2026-10-07T10:38:12Z · body
- 2026-10-07T10:39:17Z · body
- 2026-10-07T10:45:54Z · body
- 2026-10-07T10:48:08Z · body
- 2026-10-07T10:55:42Z · status active→review
- 2026-10-07T10:55:43Z · note: shots: skipped — the diff (5 changed paths) touches no [[preview.paths]] globs — no UI change to capture
