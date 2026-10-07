# Agent run operations (driver playbook)

Written 2026-10-07 from the **2026-10-06 overnight triage** on this repo (story
[#0008](../stories/field-report-first-agent-driven-project-run-opex.md), tasks
#0709, #0705, #0723). It is for a **human or agent driving a busy board** —
starting engineers, landing merges, reading failures with evidence. End-user
workflow lives in [`user-docs/running-with-agents.md`](../user-docs/running-with-agents.md);
check-gate triage lives in [`debugging-check-failures.md`](debugging-check-failures.md);
close-out mechanics live in [`close-out-pipeline.md`](close-out-pipeline.md).

Each section separates **incident context** (what we saw that night) from
**current operating rules** (verified against the code on `main` when this was
written). Do not treat an overnight log line as a product guarantee unless it
is repeated here under operating rules.

## Control plane: use the CLI, not ad-hoc HTTP

RepoOS exposes the live server through authenticated CLI commands (#0723). Prefer
these over hand-rolled `curl` and cookie jars — they re-auth on 401 after a
server reload.

| Goal | Command | Notes |
| --- | --- | --- |
| Start or resume an engineer | `repoos start <id> [--fresh]` | `--fresh` after a poisoned or degenerate session; do not resume blindly. |
| Pause a task | `repoos pause <id>` | Work stays in the worktree. |
| Spawn a turn when start did nothing | `repoos message <id> "…"` | On 2026-10-06, `/start` and `repoos review` sometimes left **no running agent**; an explicit message started a turn with clear instructions. |
| Request handoff (synchronous) | `repoos review <id> [--wait]` | Waits for validation; preferred when you need the failure reason in the shell. |
| Close-out (merge pipeline) | `repoos done <id> [--commit-dirty] [--wait]` | **Not** `repoos mv <id> done` — that only flips metadata. |
| Per-task CLI/model | `repoos override <id> --cli X --model Y` | **Verify** in the task file (`grep ^cli_override work/<id>-*.md`); a lost override once reran the wrong harness. |
| Running agents | `repoos agents` | Sanity-check between wake-ups. |
| Remote runners | `repoos runners [--probe]` | Slot holders and queue; see below. |
| Board spend | `repoos stats` | Provider-reported totals; do not invent spend. |

Full table: [`user-docs/cli.md`](../user-docs/cli.md) (Control plane).

### Handoff and status flips

- A task flipping **`active` ↔ `review` within seconds** is often the server's
  handoff **interceptor** processing a `review` request (validation starting or
  finishing), not necessarily a failed review. Check Activity and `check_runs`
  before assuming the board is broken.
- **Sending work back for branch fixes (driver):** move the task to **`active`
  through the server first** (`repoos mv <id> active` or the equivalent API) —
  **before** any worktree edits, merge, or new commits. Then let the engineer
  (or a fresh turn via `repoos start` / `repoos message`) merge `main`, resolve,
  run `repoos check`, and commit. When the tree is stable, request handoff again
  (`repoos review <id>`). Do not merge in the worktree while the task is still
  in `review` on your own initiative unless you are following the automated
  close-out conflict-repair path below.
- **Automated close-out conflict repair:** on a real merge conflict, RepoOS keeps
  the task in **`review`**, resumes the engineer in the task worktree, and asks
  them to merge `main` there — **without** re-emitting the handoff signal when
  the merge is done (`src/server/handoff.ts`). Close-out retries when the turn
  ends.
- **HEAD past the recorded handoff SHA is not always blocked.** Move to done runs
  `verifyWorktreeHandoffIntegrity` (`src/server/worktree-handoff-guard.ts`): a
  clean worktree whose tip advanced from the handoff SHA can still pass when
  every commit since handoff is **task-file bookkeeping only** (#0600) or a
  **conflict-free merge of `main` into the branch** that matches a `merge-tree`
  replay (#0624). Real implementation edits after handoff still block close-out.
  That is separate from **handoff gate drift**: if `HEAD` or the working tree
  changes **while** pre-review `repoos check` is running, finalization refuses
  (`describeStateDrift` in `handoff.ts`) so the gate result still describes what
  was tested.
- **Handoff time limits** (`src/server/handoff.ts`): the whole finalization is
  capped at **`HANDOFF_DEADLINE_MS` = 600 s (10 minutes)** via
  `withHandoffDeadline` (remote pre-review uses the same deadline). Each local
  **`repoos check` child** invoked during that finalization gets its own
  **`240_000` ms** subprocess timeout in `runCheck` — a single step can fail or
  hang at 240 s even when the outer budget has not expired, and the outer cap can
  still fire as `server-side finalization timed out (deadline exceeded)` on a
  slow remote + local combination.

### `commitDirty` / `--commit-dirty`

Move to done refuses when **`main` has uncommitted changes**. The pipeline can
commit **bookkeeping-only** dirt when you pass `repoos done <id> --commit-dirty`
(same as `POST /api/tasks/:id/done` with `commitDirty: true`).

**Operating rule:** use it only when `git status --short` on `main` shows
**nothing except `work/*.md` task bookkeeping** (Activity lines, status sync)
or an owner-approved `repoos.toml` edit you intend to land with that close-out.
Never use it to sweep up another task's uncommitted work, arbitrary source
files, or an owner's in-progress edits. If dirty files include real source,
commit or revert them on purpose first.

Bookkeeping-only drift on a **task branch** during close-out is handled inside
the pipeline (#0637); that is separate from the `commitDirty` escape on `main`.

### Previews and second servers

**Current operating rules** (see `AGENTS.md`): one **control-plane** `repoos
serve` per repo root; managed task **previews** are server-owned (request/stop
via UI or `repoos preview <id> [--stop]`); runner agents must not start `repoos
serve` themselves. For interactive browser work without OTP, `just serve-noauth`
is a **separate preview-mode** process on another port — only when no non-preview
server is already serving that directory, and never from the checkout where the
real server is running (two processes on one root both watch `work/` and fight
watchdog/reload semantics).

**Incident context (#0705, 2026-10-06):** a driver-started `just serve-noauth`
**rooted in that task's worktree** wrote many **bookkeeping commits onto the task
branch**, which then failed handoff with **HEAD moved** / gate drift. That is why
drivers should not spin up an extra serve/preview rooted in a worktree they are
about to hand off or close out — not a blanket ban on `serve-noauth` in every
context. A **managed task preview** has the same bookkeeping risk if left running:
stop it when finished (`repoos preview <id> --stop`).

## False "provider or credit" kills (#0709, #0718)

### Incident context (2026-10-06)

Healthy Cursor/pi/opencode agents were killed mid-turn. Tasks showed
`needs_input` with reason **provider-failure** whose **detail was a random
stream-json line** (timestamps, call ids, tool output). **stderr was often empty.**
The same night, tuk-private (another project on a shared dev build) looked like
a provider outage while subscriptions were fine. Root cause for the scraper
class: `#0709`. A related class for the **degenerate-output** detector
(tool/file payloads scanned as assistant text) was `#0718`.

**Do not infer** from silence alone that the model or network failed — check
version, output-health hits, and real provider errors first.

### Current behavior (`scrapeProviderFailure`)

`AgentRunner` calls `scrapeProviderFailure` on **each streamed output line**
(`src/server/agents.ts`, `src/core/agent-run-health.ts`).

| Input | What is scanned |
| --- | --- |
| Line starts with `{` (stream-json) | **Only** structured error fields on error-shaped events (`error`, `message`, `result` when `type`/`is_error`/`subtype` indicate an error). The **whole line is never substring-matched** for `402`, `billing`, `rate limit`, etc. |
| Plain text | Only if the line is **≤ 300 characters** and the **entire trimmed line** matches `isProviderFailureReason`. Long tool dumps are ignored. |

Why whole-line substring matching was fatal: stream-json lines contain
millisecond timestamps (`…402…` in ids), line numbers (`402:`), and file
contents (billing docs, rate-limit strings in code). Any of those used to match
`#0678`'s keyword list and trigger `killTurnProcess`.

Tests: `src/ui-app/tests/agent-run-health.test.ts`.

### Degenerate output (#0718)

`DegenerateOutputTracker` now scans **assistant text blocks only** — not tool
call payloads, tool results, or CLI notices (`agent-run-health.ts` header
comment). False kills from a large `read_file` or minified write were the same
*class* of bug as #0709.

Real model loops still happen (repeated markup, resumed poisoned sessions). Those
need `repoos start <id> --fresh`, not another substring tweak.

### What to do when you see the pattern

1. Confirm the running server build includes **#0709** and **#0718** (restart
   after merge if another repo shares the same `dist/`).
2. Read the `needs_input` detail: if it is a full JSON event with no error
   semantics, treat as a **false positive** on an old build or a new scraper bug.
3. If the agent died with a genuine provider message in a **short plain line** or
   structured `error` field, treat as a real provider/credit/rate-limit issue.

## Remote runner slot starvation (#0694, #0705, #0706)

### Incident context (2026-10-06)

With `engineerSelfCheckRemote` enabled, several engineers ran **standalone
remote self-checks** at once. They **pinned the first host** in config and held
**host locks** (`~/.repoos-validate-locks/`). Close-out for #0693 waited
**~590 s for a free slot on bee** while the **Remote runners** tab still looked
quiet — the server **dispatcher did not count standalone lock holders** toward
the per-host cap (#0705). Engineers also queued on one host while others were
idle until host order and limits were tuned.

Temporarily disabling remote self-check (`engineerSelfCheckRemote = false`) was
used to unblock close-out that night; **#0705** restored correct accounting and
UI for holders/waiters.

### Current operating rules

- **One cap per host** spans the server process **and** standalone
  `repoos check` runs, enforced by SSH host locks. Details: [Remote validation →
  Cross-process limit (the host lock)](remote-validation.md#cross-process-limit-the-host-lock).
- **Priority** when acquiring a slot: close-out (100) beats engineer self-check
  (30). Close-out should not be sent to a host whose slots are full of
  self-checks — the dispatch pool **samples locks over SSH** before picking a
  host (#0705).
- **Visibility:** Checks → **Remote runners** lists holders and waiters with
  phase, age, and queue position; CLI: `repoos runners`.
- **Stuck validating with no server job:** look for a **standalone** holder or a
  zombie validation container on the host (long-running Docker loop). That is an
  ops/debugging problem on the runner machine, not something to fix by retrying
  `/done` blindly.

Engineer self-check on runners plus reusing a green remote result at handoff:
#0694, #0695; config keys in `remote-validation.md`.

## When to use cheap models

Guidance is advisory; see [`agent-model-recommendations.md`](agent-model-recommendations.md)
and [`user-docs/running-with-agents.md`](../user-docs/running-with-agents.md).

From the opex field run and the overnight triage:

| Role | Typical choice | Caveat |
| --- | --- | --- |
| Engineer (default) | Cursor **Composer** on subscription | Reliable tool use for implementation tasks. |
| Reviewer | Cursor Composer (different family from engineer when possible) | Already the default in many configs. |
| Docs / small chores | OpenCode + inexpensive chat models (e.g. DeepSeek-class) | Fine for short, low-tool work; **loops or emits tool syntax as text** on long tool-heavy tasks — override to Cursor for those. |
| PM / board agents | Free or cheap models | Read-only board agents must stay read-only (#0677). |
| After a bad session | `repoos start <id> --fresh` | Resume can re-poison degenerate output; not a model switch. |

Per-task overrides: `repoos override` + verify frontmatter. Hard tasks were
moved to stronger Cursor models during opex; that is a cost/latency trade-off, not
a gate requirement.

## See also

- [Field report: opex first run](field-reports/2026-10-05-opex-first-run.md)
- [Easter eggs bundles](easter-eggs-bundles.md) — many small fixes in one task
  instead of hotfixing `main`
- [Debugging `repoos check` failures](debugging-check-failures.md) — gate flakes
  vs real bugs
