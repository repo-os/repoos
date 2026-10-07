# CTO autopilot: the approval policy and safe actions

Build context for story #0009 (Autopilot) and task #0727. The CTO takes over the
routine, rule-shaped work a human "driver" used to do by hand — landing green
reviews, restarting dead engineers, re-queuing failed close-outs — under the
owner's policy and with an audit trail, escalating anything outside policy to the
human through the attention feed. External driver sessions (Claude Code, Codex)
stay optional.

Nothing here is enabled by default. This repo's `repoos.toml` carries no
`[approval]` or `automation` section; the proposal below is for the owner to
enable deliberately.

## What exists today (verified 2026-10-07)

### Approval policy — `src/core/approval-policy.ts`, `src/server/approval-policy.ts` (#0686)

Opt-in auto Move-to-done after a clean review. `evaluateApprovalPolicy` is the
pure decision; `evaluateAutoApprove` gathers the server-side preflight (branch
exists, merge preflights clean, worktree matches its handoff snapshot, changed
paths, main clean); `tryAutoApproveAfterCleanReview` enqueues the close-out and
writes the audit entry. Disabled approval returns before gathering preflight. Merge
analysis uses `git merge-tree`, which does not change main working files, its
index or refs. A background `merge --no-commit` / `merge --abort` here can race
a human task status write; #0737 exposed this during repeated review handoffs.
Conditions already enforced before #0727:

- `disabled` / `human-only` tag / `not-in-review` / `needs-input`
- `no-rule-match` — must match a configured area or type
- `verdict-not-clean` — reviewer verdict must be `good to go`
- `blocking-bugs` — report's Bugs section must be empty
- `gate-not-green` — no lingering `last_check_failure`
- `branch-missing` / `branch-conflict` (merge preflight) / `handoff-drift`
  (worktree HEAD must equal the handoff lock SHA)
- `ui-without-visual-evidence` — UI areas need successful handoff screenshots

Added by #0727:

- `blocked-paths` — the branch diff touches a machinery path (default list:
  `src/server/`, `src/core/`, `src/cli/`, `src/commands/`, `.githooks/`,
  `repoos.toml`, `AGENTS.md`, `docs/adr/`). Fails closed when the paths cannot be
  read.
- `p0-needs-human` — a `p0` always waits for a human unless `allowP0 = true`.
- `main-dirty` — the primary checkout has uncommitted files.

### CTO safe actions — `src/core/cto-actions.ts`, `src/server/cto-actions.ts` (#0688)

Named, bounded, rate-limited, audited server actions, allowlisted via
`cto.actions`:

- `restart-stalled-agent` — relaunch a dead active engineer with the last
  failure text.
- `refresh-main-install` — run the lockfile install in the primary checkout.
- `requeue-closeout-after-env-fix` — refresh main and re-queue a failed
  close-out when the failure was environmental.

`runCtoMonitorSafeActions` runs the deterministic recovery pass on each monitor
tick; `POST /api/cto/actions/<id>` lets a human invoke one directly. Every run
records a `ctoAction` row in the attention bell.

Added by #0727:

- **Restart strategy.** `decideRestartStrategy` picks `resume` (network stall,
  timeout, interrupted turn, never-started) or `fresh` (real crash, exit with no
  handoff, or a task already restarted `CTO_FRESH_SESSION_RESTART_THRESHOLD`
  times this episode). The choice is passed to `relaunchEngineerOnActiveTask` as
  `freshSession` and written into the activity log.
- **Kill switch.** `automation.paused = true` halts every automatic action:
  policy auto-approval, CTO safe actions (actor `cto` only) and the idle nudge.
  A human's explicit action still runs.

### Serialized merges — `src/server/integration-job.ts`, `src/server/server.ts`

Merges were already serialized before #0727 and need no new mechanism:
`triggerJobProcessing` holds a `processingJob` guard so only one job runs at a
time, `JobCoordinator.peekNext()` is a FIFO over `.repoos/integration-jobs/`, and
`closeOutLock` defers auto-reload while a close-out runs. The approval policy
enqueues into that same queue, so many simultaneous auto-approvals still land one
merge at a time.

## Proposed conservative policy for this repo (owner approval required)

Do **not** put this in `repoos.toml` without the owner's sign-off — config is his.
The intent: let the CTO land routine, low-risk work unattended while keeping the
machinery and any release-critical change for a human.

```toml
approval.enabled = true
# Only clearly routine areas/types. Nothing that changes the engine, policy or
# architecture — those are caught again by machineryPaths below.
approval.autoApprove.areas = ["docs", "chore"]
approval.autoApprove.types = ["chore"]
# UI areas still need successful handoff screenshots (the built-in default list
# already covers web/ui-app/frontend/mobile).
approval.autoApprove.machineryPaths = [
  "src/server/",
  "src/core/",
  "src/cli/",
  "src/commands/",
  ".githooks/",
  "repoos.toml",
  "AGENTS.md",
  "docs/adr/",
]
approval.autoApprove.allowP0 = false

cto.actions = ["restart-stalled-agent", "requeue-closeout-after-env-fix"]
automation.paused = false
```

Rationale for the shape:

- **Land, don't decide.** Areas `docs`/`chore` type work is textual or mechanical;
  anything that changes behavior is under a machinery path and stays human.
- **`refresh-main-install` is left out of the repo's own allowlist for now.** It
  is global-scoped and mutates the primary checkout; better to add it once the
  owner has watched the other two actions for a while.
- **p0 is never automatic.** Even a docs p0 can be release-critical.
- **UI without a clean screenshot stays human** — the built-in UI area list and
  the screenshot evidence rule do this without extra config.

The kill switch (`automation.paused = true`) is the single control to stop
everything if a run goes wrong; the arrangement above is otherwise fully
recoverable by flipping `approval.enabled` or emptying `cto.actions`.

## Escalation, not guessing

Anything the policy cannot decide — a new failure shape, a disputed reviewer
finding, a hotfix on `main`, config/host/release changes — stays manual and shows
up in the attention feed. The CTO does not invent work outside its allowlist; it
reports and waits.
