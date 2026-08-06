---
id: "0042"
title: Add a per-task agent chat tab with streaming output and session resume
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/0042-agent-chat-tab
created_at: "2026-08-06T11:05:00Z"
updated_at: "2026-08-06T11:41:19Z"
---
## Activity

- 2026-08-06T11:05:00Z · created · unknown
- 2026-08-06T11:41:19Z · status inbox→ready
- 2026-08-06T11:41:19Z · status ready→active · branch feat/0042-agent-chat-tab

## Problem

0037's Start work launches the engineer agent fully detached with
`stdio: "ignore"`: `opencode run` / `claude -p` runs headless in the background
with zero visibility. The only signals are the running pulse and the
`agent.running`/`agent.exited` feed events — no output is captured, so there is
no way to see what the agent is doing, review its work, or steer it. 0037
explicitly deferred streaming agent output to this task. This adds a per-task
session view so the task's AI agent is observable and (in phase 2) steerable,
as a separate **Agent** tab alongside the task details in the drawer.

## Desired UX

- The task drawer gains a second tab — **Agent** — next to the existing task
  details. Starting work auto-switches to it.
- Agent output streams into the tab live (monospace log, autoscroll), so the
  user watches the agent work the task in real time.
- Reopening the drawer shows the transcript of the current/past session for
  that task, not just the live tail.
- Pausing stops output; the log stays readable.
- Phase 2: a message input lets the user talk to the running session — the
  agent remembers prior turns and continues its work in context.

## Scope

The work is split into phases; each phase lands independently and ends with a
green `repoos check`.

### Phase 1 — Live output stream (read-only log)

- **Spawn**: change `AgentRunner.start()` to `stdio: ["ignore", "pipe",
  "pipe"]` and capture stdout/stderr chunks per task instead of discarding
  them.
- **Transport**: emit `agent.output` SSE events `{ taskId, data, stream }`
  (line-buffered or chunked) alongside the existing `agent.running`/
  `agent.exited` events. Add `GET /api/tasks/:id/output` to fetch the buffered
  transcript so a freshly-opened tab gets history, not just the live tail.
- **Buffering**: keep a per-task ring buffer (cap ~256 KB, drop oldest) in the
  runner registry so memory can't grow unbounded; buffer lives as long as the
  session, retained after pause/stop until the task is started again.
- **UI**: `TaskDrawer.vue` gets a tabbed header (Details | Agent). The Agent tab
  renders the log (monospace, autoscroll with a stick-to-bottom toggle), the
  running pulse, and a "session ended" marker once `agent.exited` fires. The
  card's running badge links to the drawer's Agent tab.
- **Out of scope for P1**: sending messages, transcript persistence to disk,
  multiple sessions history.
- **Acceptance (P1)**:
  - [ ] Starting a task streams its stdout/stderr into the Agent tab in real
        time
  - [ ] Reopening the drawer after pause/stop still shows the buffered
        transcript
  - [ ] Buffer is capped; no unbounded memory growth across many starts
  - [ ] Zero console errors in the UI; `repoos check` passes

### Phase 2 — Interactivity (session resume + chat)

- **Session identity**: `AgentRunner` records the CLI session id per task from
  the spawn command (opencode: session from `--session <id>` on first run;
  claude: `--session`/resume token). Registry stores it so follow-ups continue
  the SAME conversation.
- **Resume spawn**: a follow-up turn re-invokes the CLI in resume mode
  (opencode `run --session <id>` / `--continue`; claude `-c --continue` /
  `--resume <session-id>`) with the same cwd/branch/worktree as the original
  launch. Verify the exact flags both CLIs accept during implementation and
  document them; degrade to "start a fresh session" with a clear note if resume
  is unavailable for a CLI.
- **Send message**: `POST /api/tasks/:id/message { text }` spawns a resume turn.
  Enforce one turn at a time per task (409 busy while a turn is running) —
  serialize, don't queue.
- **Mission prompt**: adjust the launch mission so the agent completes a turn
  and stops rather than assuming it must run to `review` in one shot — the
  session now supports iterative steering from the user.
- **UI**: message input + send button in the Agent tab (disabled while busy /
  not running); user messages appear in the transcript; `agent.output` streams
  the reply back in place.
- **Acceptance (P2)**:
  - [ ] Sending a message resumes the SAME session (agent recalls its own prior
        turns) and streams the reply into the log
  - [ ] A second message while a turn runs returns 409 and is not lost silently
  - [ ] Session continuity verified for opencode AND claude; behavior documented
  - [ ] Zero console errors; `repoos check` passes

### Phase 3 — Persistence & review (stretch)

- **On-disk transcripts**: append `agent.output` to a per-task log file under a
  repoos-managed location (e.g. `config.root/.repoos/transcripts/<taskId>.log`),
  so sessions survive server restarts and are reviewable after `done`.
- **Review affordances**: show the transcript on a done task; link the task's
  branch/worktree for diff review next to the transcript.
- **Acceptance (P3)**: transcript persists across a server restart; a done
  task's Agent tab still shows its final session; `repoos check` passes.

## Notes for AI

- **Depends on 0037** (merged): reuse `AgentRunner`, the running registry,
  `/api/agents/running`, and the existing `agent.running`/`agent.exited` SSE
  events; do not regress the stop contract (SIGTERM → SIGKILL) or the fail-soft
  spawn behavior.
- **Worktrees (0041)**: independent — the Agent tab renders whatever cwd the
  runner uses. If 0041 lands first, resume turns must use the task's worktree
  path, not the root.
- **Zero runtime deps**: no new packages. Output capture and resume are plain
  child_process plumbing; SSE reuses the existing client set in `server.ts`.
- **Buffered memory**: the 256 KB cap is a hard requirement — a long-running
  agent must not balloon the server heap.
- **Test alongside**: extend `src/ui-app/tests/repo-store.test.ts` for the new
  SSE event / fetch endpoints, matching 0037's mockFetch pattern.

## Related

- 0037 built the launch mechanics (Start/Pause, running registry, SSE events)
  that this task makes observable and steerable. 0041 moves the agent's working
  directory to a worktree but does not change the session model. 0040
  (drag-to-move status) is independent UI.

## Activity

- 2026-08-06T11:41:18Z · status inbox→ready
- 2026-08-06T11:41:19Z · status ready→active
