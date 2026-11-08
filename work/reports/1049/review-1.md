---
task: 1049
pass: 1
at: "2026-11-07T07:33:01.019Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/remote-validation-stop-killing-healthy-r
state: ok
tree_identity: "96936d8cc:"
---
## Verdict
needs some work — the reaper never runs, captured evidence is hidden in the task UI, and cleanup can match unrelated containers.

## Relevance
still relevant — the earlier watchdog work does not address these new reaper and evidence-display gaps.

## Evidence
None

## Bugs
- **Reaper scheduling is unreachable** — `src/server/remote-validation.ts:3973-3974` defaults a missing `lastReaperAt` to `now`, making the elapsed time zero; the map is only initialized inside that same condition. The reaper therefore never runs. Tests at `src/ui-app/tests/remote-host-pool.test.ts:2587-2589` only inspect command text, not scheduling or logging.
- **Evidence is stored but not shown** — `src/server/remote-validation.ts:5555-5565` attaches hang evidence, but `src/ui-app/src/types.ts:1226-1237` omits it and `src/ui-app/src/components/DebugPanel.vue:236-245,704-713` renders only the event message. Users cannot inspect the captured logs or state in the task events.
- **Container ownership uses substring matching** — Docker’s `name` filter matches names containing the value, not only names with that prefix. `reaperCommand()` at `src/server/remote-validation.ts:1246` can force-remove an unrelated old container whose name contains `repoos-validate-`; the existing `staleContainerCleanupCommand()` at line 1020 has the same matching flaw for stopped containers.

## Edge cases
None found

## Suggestions
None found

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

