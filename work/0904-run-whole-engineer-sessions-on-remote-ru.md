---
id: "0904"
title: "Run whole engineer sessions on remote runners, not only checks, shots and gates"
type: feature
status: active
priority: p1
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/run-whole-engineer-sessions-on-remote-ru
cli_override: opencode
model_override: opencode-go/glm-5.3-flash
created_at: "2026-10-21T15:06:23Z"
updated_at: "2026-10-22T01:15:54Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-21T20:52:34.600Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
dev_error_count: 6
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-22T01:11:24.755Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-22T01:14:35.238Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-22T01:14:36.767Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-10-22T01:14:38.696Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-10-22T01:14:40.167Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-10-22T01:14:41.782Z\",\"kind\":\"dev-error\"}]"
engineer_failover: "{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\"}"
---
## Problem
Remote runners (bee, thinkpad, mini) today run only validation: self-checks, handoff and close-out gates, and (#0854/#0874) browser shots. The engineer and reviewer agents themselves still run on the laptop. The laptop is a fanless MacBook Air under constant memory pressure (compressor 35-38% of RAM, pressure guard holding new starts, 3 engineers + gates + browsers at once), which is now the main throughput limit: engineers are held, tests time out, and gates fall back to the laptop.

## Desired UX
A task can be started on a chosen runner (or the least loaded healthy one). The engineer process runs in a worktree on that host in the repoos-ci environment; the laptop shows the live transcript and can message, pause and resume it as today; review and close-out are unchanged. Local runs remain the default and the fallback. Runner choice and health are visible per task.

## Acceptance criteria
- An ADR (docs/adr/) decides the execution model: remote worktree + sync of commits back (bundle/push to a local bare ref) vs. a remote checkout mounted over ssh/sshfs; how each engineer CLI gets its auth on a runner without anything sensitive written into repoos.toml or task files (design only: documented as a setup checklist for the human follow-up task); and how reload-durability (#0288) and phantom-runner healing (#0863) apply.
- Spawn/stream/stop/message/resume of an engineer on a remote host through the existing AgentRunner interface, with transcript streaming and heartbeat; a lost connection is distinguished from a crashed agent. Proven with fake runners and fake CLIs in tests only.
- Worktree creation and commits happen on the runner; the branch tip is fetched back before handoff so lock sha == worktree HEAD still holds; handoff gates run on the same host or another healthy one.
- Pressure/health-aware placement (see #0901 health-aware dispatch, landed) and a per-host concurrent-engineer limit with Settings controls.
- Failure injection tests: runner unreachable at start, mid-run disconnect, runner reboot, dirty remote worktree; each ends in a clear state with a recovery path.
- Docs: user-docs and docs/remote-validation.md updated, including the setup checklist; AGENTS.md rule about editing the right worktree updated for remote worktrees.
- Out of scope here (done by the human in #0907): setting up the CLI auth on each runner, and one real end-to-end remote engineer run on bee, thinkpad and mini.

## Notes for AI
Large; split into stories/tasks after the ADR. Depends in spirit on #0900 (tests isolated from host pressure), #0901 (health-aware dispatch) and #0897 (queue visibility). Start with the ADR; do not build before it is accepted. Existing pieces: src/server/remote-validation.ts, scripts/remote-runner/*, host pool lease/LRU, bundle upload (#0717), src/server/agents.ts AgentRunner.

## ADR and split
This increment delivers the ADR required by the task notes (docs/adr/0009-remote-engineer-sessions.md, proposed) plus the docs/setup-checklist updates and the AGENTS.md remote-worktree rule. Per the task's own guidance ("Start with the ADR; do not build before it is accepted. Large; split into stories/tasks after the ADR."), the spawn/stream/stop/resume implementation, placement Settings, fetch-back handoff wiring and failure-injection suite are split into the six follow-up tasks listed in the ADR's "Follow-up work" section and are not built in this pass. #0907 remains the human auth + real-run task.

## Shots
```json
[
{
"label": "New \"Remote engineer sessions\" docs page (planned feature, what moves where, config keys, setup checklist)",
"target": "Docs site",
"route": "/remote-engineers",
"highlight": ".vp-doc"
}
]
```

## Activity

- 2026-10-21T15:06:23Z · created · njachowski@gmail.com
- 2026-10-21T15:06:27Z · needs_input
- 2026-10-21T15:06:39Z · needs_input
- 2026-10-21T15:59:08Z · needs_input
- 2026-10-21T16:56:48Z · needs_input
- 2026-10-21T17:59:34Z · needs_input
- 2026-10-21T18:13:32Z · body: Acceptance criteria (added 4, removed 3)
- 2026-10-21T18:14:01Z · needs_input
- 2026-10-21T18:42:05Z · needs_input
- 2026-10-21T19:35:54Z · status inbox→ready
- 2026-10-21T19:36:58Z · body: Acceptance criteria (added 5, removed 5)
- 2026-10-21T19:37:04Z · needs_input
- 2026-10-21T19:37:27Z · status ready→active, branch
- 2026-10-21T19:41:41Z · body
- 2026-10-21T19:41:41Z · body
- 2026-10-21T19:42:25Z · body: ADR and split (added)
- 2026-10-21T19:42:26Z · message_queued at 2026-10-21T19:42:26.042Z
- 2026-10-21T19:42:49Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T19:43:47Z · body
- 2026-10-21T19:43:47Z · body
- 2026-10-21T19:44:15Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-21T19:44:15Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-21T19:44:15Z · message_delivered: 1 message(s)
- 2026-10-21T20:52:33Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-10-21T20:52:34Z · message_queued at 2026-10-21T20:52:34.482Z
- 2026-10-21T20:52:35Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T21:25:57Z · CTO nudge: held — remote validation is running
- 2026-10-21T23:07:50Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T23:51:38Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T01:11:24Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-22T01:11:24Z · agent exited with an error (opencode) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-10-22T01:11:24Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-10-22T01:11:25Z · message_delivered: 1 message(s)
- 2026-10-22T01:13:15Z · body
- 2026-10-22T01:13:15Z · body
- 2026-10-22T01:14:01Z · body
- 2026-10-22T01:14:35Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T01:14:36Z · engineer crash recovery: switched opencode + opencode-go/deepseek-v4.1-flash → opencode + opencode-go/glm-5.3-flash after 3/3 crashes in 30m · error: Go usage limit exceeded
- 2026-10-22T01:14:38Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T01:14:40Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (2/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T01:14:41Z · engineer crash recovery: surfaced instead of switching — RepoOS already switched this task once (opencode + opencode-go/glm-5.3-flash); it will not chain another automatic switch (3/3 crashes in 30m)
- 2026-10-22T01:15:54Z · needs_input
