---
id: "0121"
title: Make managed preview requests work from sandboxed agents without localhost access
type: bug
status: review
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: feat/make-managed-preview-requests-work-from-
created_at: "2026-08-12T05:23:56Z"
updated_at: "2026-08-12T10:58:09Z"
---
## Activity

- 2026-08-12T05:23:56Z · created · unknown


## Problem

RepoOS tells engineer agents to request their managed preview with:

```bash
curl -sS -X POST "${REPOOS_API_URL}/api/tasks/${REPOOS_TASK_ID}/preview"
```

Codex and other securely sandboxed agents may have filesystem access to their
worktree but no localhost networking. In that environment, the required call
always fails with `curl: (7) Failed to connect to 127.0.0.1 port 7171`, even
while RepoOS is healthy and the same endpoint works from the host.

The mission then correctly forbids launching a fallback server and requires
the agent to stop. Finished UI tasks repeatedly consume hundreds of thousands
of tokens, pass build/tests, and still remain `active` because they can never
satisfy the preview checklist. #0114 reproduced this multiple times.

Granting the coding agent broad host networking would weaken the intended
sandbox. Preview lifecycle is a privileged RepoOS responsibility and needs a
runner-mediated control path, like the server-owned handoff capability.

## Desired UX

- A sandboxed agent can express “start/reuse my managed preview” without
  directly connecting to localhost or choosing a port.
- RepoOS validates the request against the currently registered task/run and
  starts the preview from the task's worktree on the privileged server side.
- The agent receives enough information to verify the result when its sandbox
  supports browser access; otherwise RepoOS performs the required smoke/URL
  probe itself and returns a structured success/failure to the transcript.
- Repeating the request is idempotent and returns the same task preview.
- Agents never launch `repoos serve`, manipulate preview processes, or gain
  general host networking.

## Acceptance criteria

- [ ] Replace the mission's mandatory agent-originated localhost `curl` with a
      sandbox-compatible structured intent handled by `AgentRunner` and the
      RepoOS server. A dedicated exact output signal or equivalent narrow IPC
      is acceptable.
- [ ] Bind each preview request to a live server-issued run capability:
      task ID, run ID, registered branch, and registered worktree. Reject
      forged, expired, cross-task, and path-substitution requests.
- [ ] The agent cannot supply a port, command, executable, or arbitrary path.
      RepoOS alone chooses and owns preview process/network lifecycle.
- [ ] Starting/reusing a preview is idempotent per task and uses the existing
      `PreviewManager`; do not create a parallel preview implementation.
- [ ] Stream server-side progress and the final preview URL/probe result into
      the task transcript using trusted system entries so the agent and human
      can see what happened.
- [ ] When the agent sandbox cannot open the returned URL, RepoOS performs a
      server-side health/static-page probe and records the result. A UI smoke
      check must still be part of `repoos check`; preview success must not
      weaken the definition-of-done gate.
- [ ] Preview failure gives an actionable reason and leaves the same agent
      session/worktree resumable. It must not instruct the agent to retry an
      impossible localhost call indefinitely.
- [ ] Update generated agent mission/context-pack instructions so all drivers
      use the new path and the old `curl ${REPOOS_API_URL}` requirement is
      removed.
- [ ] Preserve the existing human-facing `POST /api/tasks/:id/preview` API and
      Preview button for trusted UI/host clients.
- [ ] Tests cover Codex-like no-network operation, valid intent, forged task or
      run, expired request, repeated request, preview startup failure, server
      transcript reporting, and cleanup when task state changes.
- [ ] Add an end-to-end fixture where a fake agent has no localhost access yet
      successfully requests and receives server-verified preview completion.
- [ ] `repoos check` passes.

## Notes for AI

- Follow ADR-0005's design: agents express intent; RepoOS owns privileged
  process and network operations.
- Reuse the run ID/capability pattern from server-owned handoff (#0094), but
  keep preview and handoff signals distinct and independently validated.
- Likely touch points: `src/server/agents.ts`, `src/server/server.ts`,
  `src/server/preview.ts`, context-pack/mission tests, and preview integration
  tests.
- Do not fix this by adding `--dangerously-bypass-approvals-and-sandbox`, broad
  network access, a fixed/shared port, shell-command passthrough, or a writable
  control file that any process can spoof.
- #0119 fixes Codex resume argument ordering. It is related operationally but
  independent from this preview transport bug.
- #0114 is the primary reproduction: builds and all tests passed, while every
  agent turn stopped solely because sandboxed `curl` could not reach 7171.

## Activity

- 2026-08-12T10:42:29Z · status ready→active, branch
- 2026-08-12T10:58:09Z · status active→review
