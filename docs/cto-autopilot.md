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
- `blocking-bugs` — report's Bugs section must list no findings (any "None found"
  phrasing, including `None found.`, `No bugs found` or `N/A`, is empty)
- `gate-not-green` — no lingering `last_check_failure`
- `branch-missing` / `branch-conflict` (merge preflight) / `handoff-drift`
  (worktree HEAD must equal the handoff lock SHA)
- `ui-without-visual-evidence` — UI areas need successful handoff screenshots

`repoos landable <id>` (#0867) exposes the same `gatherApprovalPreflight` result
read-only for any task, whether or not approval is enabled. It adds the finer
classification the policy leaves implicit: conflicts restricted to the task's
own `work/<id>-*.md`, foreign `work/inputs/stories` paths in the diff, and which
dirty files on main block (`repoos.toml`, `reminders/`, `schedules/`, unknown).
A branch the policy would not auto-land therefore cannot be reported landable by
the command or the drawer.

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

## The idle nudge — wait for a genuinely idle engineer (#0873)

The CTO monitor's one automatic action is a bounded completion reminder to an
active engineer (`nudgeIdleActiveTasks` in `src/server/cto-monitor.ts`). It used
to fire on worktree silence alone after five minutes, which is not the same as
idleness: a long `repoos check`, a test run, a remote-validation wait, a headless
browser step or a thrashing machine all leave files untouched while real work is
happening. On 2026-10-20 reminders reached engineers that were busy, queued as
messages, and hid the real cause.

Before nudging, the monitor now takes one snapshot and holds the reminder when
any of these is true — recording the reason once per idle stretch in the task
activity log (`CTO nudge: held — …`) instead of sending it:

| Signal | Source | Held reason |
| --- | --- | --- |
| Engineer process group has no live process | runner entry vs. its recorded group (#0863) | phantom runner — recovery owns it, not a nudge |
| A known work child is alive in the group | `ps` on the turn's process group | `repoos check`, vitest, bun, build, headless browser |
| Handoff gate finalizing / pending | `isHandoffInFlight` / `hasPendingHandoff` | handoff gate is running |
| Review turn running | `ReviewManager.isRunning` | review is running |
| Remote-validation run active | `RemoteValidator.activeRemoteRuns()` | remote validation is running |
| Undelivered message queued | `hasQueuedMessages` | an undelivered message is already queued |
| Machine memory pressure | `pressureReason` from `src/core/pressure-guard.ts` (#0871) | swap/compressor/available-memory reading |
| Cooldown or idle window not reached | nudge marker in the task body, `updated_at` | no log, just wait |

The harness process itself being alive is *not* a reason to hold the nudge — a
model that is thinking has a live process and no worktree output, which is
exactly the case the reminder exists for. A live *child* doing a known step is
the busy signal. Load average is only consulted by the pressure guard when the
platform gives no memory reading.

The idle threshold and cooldown are live Settings controls
(`cto.nudgeIdleMs`, default 5 minutes, and `cto.nudgeCooldownMs`, default 60
minutes; minimums 30s and 1min). Invalid values fall back to the defaults.
`automation.paused = true` still halts the nudge entirely, as it does every
other automatic CTO action. The reminder text names the handoff command and
says plainly that it does not move the task itself.

Anything the policy cannot decide — a new failure shape, a disputed reviewer
finding, a hotfix on `main`, config/host/release changes — stays manual and shows
up in the **needs-a-decision digest** (`GET /api/decisions`, `repoos decisions`
or `repoos attention` in the CLI, Mission Control panel). Each item carries an
extracted cause (failing step, test names, close-out log path), evidence links,
and the safe actions available, with CTO/policy automatic actions labeled
separately from what needs you. Routine items the approval policy or CTO safe
actions would handle are omitted while automation is on. The broader notification
bell (`GET /api/attention`) still lists informational events; the digest is the
CTO's escalation surface only. The CTO does not invent work outside its allowlist;
it reports and waits.

## The board brief (rotation and handoff)

The escalation digest answers "what needs a decision". The **board brief**
(`GET /api/driver/brief`, `repoos driver brief [--json]`) answers "what is the
state of the board right now" — the snapshot a driver needs on rotation, whether
that is the CTO, a human, or an external agent session. It lists next actions
(tagged CTO vs. human), the board by status with each task's cause, merged tasks
since the last tag with SHAs, running agents, the close-out queue, host health
and recent slow/hung runs, config keys changed since the release baseline, and
the AGENTS.md rules that matter to a driver. `--json` makes it loadable by a
driver agent. It replaces the hand-written handoff doc that went stale in
minutes (#0731). Durable lessons belong in `docs/driver-notes.md`, in the repo,
not in an agent's private memory.

A driver that lands a task still obeys the rule in AGENTS.md's **Review and
sign-off** section: never close out a task flagged `needs-human-step` as if the
human part were done. Confirm the landed scope needs no human; if an acceptance
criterion does, split it into its own task first (`repoos new "<title>"
--depends-on <id>`, then `--assigned-to human --hold true`) and narrow the
original before Move to done (#0660, #0784). The approval policy already refuses
to auto-approve any `needs-input` task, so this only arises when a driver lands
one by hand.
