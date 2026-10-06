---
id: "0725"
title: "P0: remote validation breaks on hosts with the old validate.sh since #0717: new bundle has no HEAD ref, old script clones an empty repo"
type: bug
status: inbox
priority: p0
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T16:15:47Z"
updated_at: "2026-10-06T16:15:59Z"
---
## Problem

#0717 (merged 2026-10-07 16:10Z) changed what the server uploads: the bundle now carries per-run refs (refs/repoos/candidate-<id>, refs/repoos/scope) instead of HEAD, and the host's validate.sh was extended with a mirror-path argument. The hosts' /opt/repoos/validate.sh is root-owned and was NOT updated (bee, thinkpad, mini all have the 3774-byte 2026-09-28 copy; no sudo without a password). Result: every remote run since the merge fails in 4-8 seconds with:

  [validate] cloning bundle /home/nick/.repoos-<task>-<id>.bundle
  warning: You appear to have cloned an empty repository.
  fatal: unable to read tree (<sha>)

(old script does 'git clone <bundle>', which needs a HEAD ref the new bundle lacks). Seen on #0722 and #0723 pre-review at 16:12-16:13Z (checks.db check_runs failed_step=remote-validation, exit 128). Handoffs fall back to the slow local gate (fallbackToLocal), and close-outs would too. The reviewer assumed 'older RepoOS against newer script' compatibility (validate.sh comment) but not the reverse, which is the real rollout order.

## Desired UX

- The server must work with ANY installed validate.sh. Before choosing the transport, detect whether the host's script supports the mirror argument (e.g. during the existing prereq/probe call: grep -q MIRROR /opt/repoos/validate.sh, or a version marker line the new script prints with --version). Cache per host. If unsupported: send the legacy full bundle that includes a HEAD ref (exactly what the pre-#0717 server did) and the old 4-argument call, and log 'runner script is old: using full bundle; update /opt/repoos/validate.sh to enable incremental uploads'.
- The Remote runners tab and the host probe show each host's script version / 'mirror supported' state, and a one-line install command for the owner.
- Never fail a run because of script mismatch: if the first attempt fails with 'cloned an empty repository' or exit 3 transport error, retry once with the legacy full bundle.

## Acceptance criteria

- Tests: host with old script -> legacy bundle contains HEAD and the 4-arg call; host with new script -> incremental path; mismatch error -> single retry with the legacy bundle; probe result cached per host.
- Docs (docs/remote-validation.md rollout section: hosts must be updated, how to install validate.sh; user-docs/check.md). repoos check passes.

## Notes for AI

URGENT: this blocks all remote validation on this board. Read #0717's diff (src/server/remote-validation.ts prepareCandidateUpload, probeMirror, scripts/remote-runner/validate.sh) and the failing rows in .repoos/checks.db (started_at >= 2026-10-07 16:12). Keep the incremental path working when the host script is new. Do NOT touch hosts or repoos.toml.

## Activity

- 2026-10-06T16:15:47Z · created · unknown
- 2026-10-06T16:15:59Z · cli_override, model_override
