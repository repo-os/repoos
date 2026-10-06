---
id: "0725"
title: "P0: remote validation breaks on hosts with the old validate.sh since #0717: new bundle has no HEAD ref, old script clones an empty repo"
type: bug
status: active
priority: p0
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/p0-remote-validation-breaks-on-hosts-wit
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T16:15:47Z"
updated_at: "2026-10-06T18:49:29Z"
review_passes: 1
handoff_signal_retry_count: 1
last_check_failure: "repoos check at 2026-10-06T17:03:07.270Z: repoos check failed: [22m[39m[repoos] failed to escalate failed exit for #0001: ENOENT: no such file or directory, open '/tmp/repoos-pause-nep5pr/work/0001-pause-and-resume.md' · [32m✓[39m tests/pause-resume.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 332[2mms[22m[39m · [32m✓[39m tests/raw-config-store.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 18[2mms[22m[39m · [31m❯[39m tests/auth.test.ts [2m([22m[2m0 test[22m[2m)[22m · error: Cannot find module '@vitest/expect… (truncated)"
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

## Shots
```json
[
  {
    "label": "Remote runners tab shows validate.sh mirror state",
    "target": "default",
    "route": "/checks?tab=runners",
    "highlight": ".rr-panel"
  },
  {
    "label": "Settings remote validation host mirror status",
    "target": "default",
    "route": "/settings?tab=remote-validation",
    "steps": [
      {
        "click": "button[data-test-id=open-remote-validation]"
      },
      {
        "waitMs": 400
      }
    ]
  }
]
```

## Activity

- 2026-10-06T16:15:47Z · created · unknown
- 2026-10-06T16:15:59Z · cli_override, model_override
- 2026-10-06T16:16:14Z · status inbox→ready
- 2026-10-06T16:16:23Z · status ready→active, branch
- 2026-10-06T16:24:08Z · body: section Shots
- 2026-10-06T17:04:01Z · body
- 2026-10-06T17:20:54Z · body
- 2026-10-06T17:27:08Z · status active→review
- 2026-10-06T17:27:08Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
- 2026-10-06T17:28:16Z · note: review pass 1: good to go
- 2026-10-06T17:35:32Z · status review→active
- 2026-10-06T17:40:46Z · handoff failed · ui-review handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded.
- 2026-10-06T17:46:28Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — ui-review handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T17:46:28Z · status review→active
- 2026-10-06T17:47:12Z · handoff failed · task-file handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded.
- 2026-10-06T17:52:28Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — ui-review handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T17:52:28Z · status review→active
- 2026-10-06T17:53:12Z · handoff failed · task-file handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded.
- 2026-10-06T17:58:28Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — ui-review handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T17:58:28Z · status review→active
- 2026-10-06T17:59:13Z · handoff failed · task-file handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded.
- 2026-10-06T18:04:28Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — ui-review handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T18:04:29Z · status review→active
- 2026-10-06T18:05:35Z · handoff failed · task-file handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded.
- 2026-10-06T18:11:28Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — ui-review handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T18:11:28Z · status review→active
- 2026-10-06T18:12:14Z · handoff failed · task-file handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded.
- 2026-10-06T18:17:28Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — ui-review handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T18:17:28Z · status review→active
- 2026-10-06T18:18:15Z · handoff failed · task-file handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded.
- 2026-10-06T18:23:29Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — ui-review handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T18:23:30Z · status review→active
- 2026-10-06T18:24:23Z · handoff failed · task-file handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded.
- 2026-10-06T18:29:29Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — ui-review handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T18:29:29Z · status review→active
- 2026-10-06T18:30:38Z · handoff failed · task-file handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded.
- 2026-10-06T18:36:28Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — ui-review handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T18:36:29Z · status review→active
- 2026-10-06T18:37:16Z · handoff failed · task-file handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded.
- 2026-10-06T18:42:28Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — ui-review handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T18:42:29Z · status review→active
- 2026-10-06T18:43:37Z · handoff failed · task-file handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded.
- 2026-10-06T18:49:29Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — ui-review handoff failed at verify · ui verification: capture of /settings?tab=remote-validation failed — click: Timeout 5000ms exceeded. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-06T18:49:29Z · status review→active
