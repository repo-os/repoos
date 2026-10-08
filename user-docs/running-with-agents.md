# Running a project with AI agents

A practical loop for driving a RepoOS board with coding agents — yours, or a team
of cheap ones. It comes from building a real 30-task app (a Vue front end, a Bun
API and Postgres) with low-cost agents on one laptop. Each point is something
that cost real time when it was missed.

If you are an agent starting a **new** project, read
[Starting a new project as an agent](/getting-started#starting-a-new-project-as-an-agent)
first, then come back here.

## 1. Plan once, carefully

- Write tasks **small**: one outcome each, with a Problem, a Desired UX,
  Acceptance criteria and Notes for AI. Put checkable criteria in
  ("works at 375px wide", "browser console is clean", "tests cover the empty
  case").
- **Bundle small, unrelated fixes instead of filing one task each.** When a run
  turns up several small, low-risk fixes — cosmetic, copy, test hardening, tiny
  corrections, docs follow-ups — collect them into one `Easter eggs bundle`
  task (title it with the themes it covers) rather than one task per fix or a
  hotfix to `main`: one worktree, one check run, one review, one close-out. Keep
  it to about 3–6 items in one area family, and never fold them into a
  release-critical task. See
  [Easter-eggs bundles](../docs/easter-eggs-bundles.md) for the reasoning and
  the task template.
- Encode the order with `dependsOn`. The sequencing judgment belongs **here**,
  at planning time. Once the graph is right, auto-engineering picks the next
  tasks deterministically: priority first, then how much downstream work each
  candidate unblocks (its critical-path weight), then creation order. Held tasks
  (`hold: true` or a `hold` tag) stay ready but are skipped. With
  `autoEngineering.pmVeto` enabled, a PM pass runs only when there are more
  eligible tasks than open slots **and** two candidates would collide (same
  area or a declared shared path); it may reorder or defer, never invent work.
- Put the context agents need where they will read it: an index file in your docs
  directory with a reading order, a short block of hard rules in `AGENTS.md` that
  points at it, and a glossary of your domain words. Keep reference code and
  legacy material out of the build. Never put real data or secrets in the repo or
  in task text.
- Keep human-only verification out of agent tasks: if acceptance criteria need a
  real device, hardware, account, credentials, or third-party registration, split
  that into a separate task a person runs. RepoOS flags mixed criteria at
  creation with `needs-human-step`.

## 2. Choose agents per role

- Use a cheap default engineer, a reviewer from a **different model family**
  than the engineer, and read-only helpers (CTO, Ross) on free or small models.
- For a hard task, override the engineer on **that task** before you start it.
  Persist the pin with `PATCH /api/tasks/<id>` (`cliOverride`, `modelOverride`,
  and optionally `agentOverride`), `repoos update <id> --cli … --model …`, or
  the task drawer's agent picker. `POST /api/tasks/<id>/start` and
  `/message` **reject** override fields in the body with HTTP 400 and name the
  PATCH route — they never apply a one-shot override to the engineer run.
  PM chat (`POST /api/tasks/<id>/pm/message` and story PM routes) still accepts
  `cliOverride` / `modelOverride` in the body for that turn only. After you
  start, confirm the effective assignment on the task card (robot panel) and in
  the drawer's run header (`agent · cli · model`), not from the HTTP status alone.
- Watch for model failure modes on long, tool-heavy tasks: a runaway loop of
  repeated tokens, an agent that says "I'll call the tool now" without calling
  it, or a request that never returns. Restarting the task on a stronger model is
  usually cheaper than another round of fixes.

## 3. Keep the gate fast and the machine calm

- Aim for a full `repoos check` well under two minutes: small fixtures in tests,
  sensible test timeouts, an incremental typecheck. A slow gate turns into
  close-out timeouts that look like real failures.
- Run at most **two tasks at once** on a laptop.
- If you have [remote runners](/configuration#remote-validation), trust the
  gate to be honest about where it ran:
  - Hosts are **probed at server start** and **every 60 s while unhealthy**, so
    dispatch never waits for the Checks tab to be open and a host that comes
    back rejoins the pool on its own. A host that fails its probe is reported
    with its reason (`host unreachable — Tailscale connected and logged in?`,
    missing toolchain or image, …) instead of silently failing jobs.
  - When remote validation is on but a gate ran on this machine, the bell
    raises **Ran locally (remote enabled)** naming the task. That is
    `fallbackToLocal` doing its job with no healthy runner — not a silent
    success.
  - The run's detail says why. Open **Checks → Runs**, expand the local row and
    read its **detail** (`Ran locally: no healthy runner`, a config error, …);
    the remote half of the same gate is the row attributed to the host.
  - **Checks → Remote runners** shows each host's live state: **ready**,
    **unavailable** (with the probe reason), or **unreachable**, plus in-flight
    runs (`N/M`, task and elapsed time), the FIFO queue and any lock holders,
    a per-host **Server stats** row, and **Hung runs**. Use it to answer "is
    the pool actually being used, and why not?"
  - Prefer **`GET /api/attention`** (or the `attention.updated` SSE event) to
    polling job files by hand. Its contract is in
    [Remote validation](../docs/remote-validation.md).
- Keep the primary checkout **clean**. Commit configuration and bookkeeping
  writes straight away, or **Move to done** will refuse.
- Close-out candidates reuse the primary checkout's `node_modules` by default.
  Move to done refreshes that install automatically after a merge that changes
  package inputs; if close-out still fails with missing modules, use **Refresh
  install and retry** or set `[closeOut] candidate = "own-install"` for monorepos.

### Drive the board by events (not polling)

The control plane streams board events on **`GET /api/events`** (SSE). Prefer
waking your session on those signals instead of polling task status on a timer —
missed timers are how overnight runs lose hours.

- **`repoos watch [--json] [--task <id>]`** prints the same feed the CTO monitor
  reacts to. It reconnects after a server reload and re-logs in on HTTP 401.
  Exit code is non-zero when the server is unreachable.
- Each watch line carries **`taskId`**, **`cause`**, and **`evidence`** links
  (task drawer route, attention feed, close-out outcomes). See
  [Board events contract](../docs/board-events-contract.md).
- **`POST /api/cto/heartbeat`** (or the monitor's own wake-ups) records CTO
  liveness. When routine work is waiting and no heartbeat arrives, the bell shows
  **CTO silent N min** via `GET /api/attention`.

### Read the board's brief, don't hand-write a handoff

Rotating drivers used to write a handoff document by hand. It went stale in
minutes. `repoos driver brief` **generates** the handoff from live state, so a
new driver (the CTO, a person, or an external agent session) starts from the
board's actual condition:

```bash
repoos driver brief          # human-readable
repoos driver brief --json   # load it into a driver agent
```

The brief covers:

- **Next actions**, each tagged `CTO` (policy can take it) or `you` (a person
  must) — stalled engineers to restart, failed close-outs to retry, reviews
  waiting at the sign-off gate, ready tasks no one has started.
- **The board by status**, every task with the cause it is where it is
  (waiting on a human, branch drifted from main, awaiting sign-off, …).
- **Merged since the last tag**, with short SHAs and the task each commit came
  from.
- **Running agents** (flagging any that have gone quiet), the **close-out
  queue**, and **failed close-outs** with their reason.
- **Host health** and **recent slow/hung runs**, with a best-guess cause.
- **Config keys changed since the last release tag** — what moved, from the
  `chore(config):` commits, and the keys themselves diffed against the baseline.
- **The AGENTS.md rules that matter to a driver**, pulled from the operating
  loop / rules / review sections so they travel with the brief instead of being
  re-read by hand.

The same snapshot is on **`GET /api/driver/brief`**. Lessons a driver learns
belong in the repo, not in a private memory store: append them to the driver
notes file (see `AGENTS.md` → "Where project knowledge goes"), so the next
session inherits them.

## 4. The review loop

- For UI tasks, **handoff runs a browser verification gate** before review: declared
  (or auto-matched) shots are captured through the managed preview while Playwright
  records console errors, failed requests, and horizontal overflow at configured
  viewport widths (`uiVerification.enabled` and `uiVerification.viewportWidths` in
  `repoos.toml`, default on with 1024px and 375px).
  Console errors, failed same-origin requests, overflow, blank captures, wrong-route
  redirects, and failed required `assert` entries **block handoff**; a missing
  `highlight`/`selector`/`waitFor` target is a **warning** with the screenshot
  still saved (#0743). Use `state` fixtures (`closeOut:active`, `card:doneError`,
  `board:withReviewTask`) when the UI only exists in a particular board state.
  Concurrent verifications **queue** for the one preview slot. Evidence is written
  under `.repoos/ui-verification/`. When Playwright is missing, the gate skips with
  a visible note (same as other browser checks).
- Read the reviewer's report and the **handoff screenshots** in the task drawer
  Changes tab. The reviewer is prompted to comment on them and flag blank captures.
  You can still open the task preview yourself for a second look — automated checks
  and LLM reviewers miss defects a human sees in seconds.
- A task preview can boot **companion services** alongside the main command:
  declare repeatable `[[preview.services]]` tables and list their names on a
  `[[preview.targets]]` row (`services = ["API"]`). Each service gets its own
  OS-assigned port; the main command reaches it via `{api.port}` /
  `{api.url}` or `REPOOS_PREVIEW_API_PORT` / `REPOOS_PREVIEW_API_URL` (name
  lowercased, non-alphanumerics to `_`). That lets a full-stack task — API and
  UI on the same branch — be verified in preview without merging first. If you
  only start the web dev server and proxy `/api` to the primary checkout, the
  new UI may parse an old response and look like a UI regression.
- The running server re-reads `repoos.toml` when it changes on disk (including
  after a merge to the primary branch), so new `[[preview.targets]]` rows show
  up without restarting `repoos serve`.
- Feedback that must survive a change of engineer session (a different CLI or
  model) belongs in the **task body** or the **stored review report**. A chat
  message lives only in the session it was sent to. Each review pass is also kept
  as a numbered artifact (`.repoos/reviews/<taskId>/<pass>.md`) with a one-line
  summary in the task activity log; the latest pass still overwrites
  `.repoos/reviews/<taskId>.md` for sign-off. Unresolved review findings are
  injected into new engineer sessions automatically.
- Approve only after you have seen it work. Approval is a human decision.
- By default, **Move to done** stays a human step. You can opt in under Settings
  → **Auto-approve clean reviews**: when enabled, tasks that match configured
  **areas** or **types**, passed the handoff gate with a clean reviewer verdict,
  and are not tagged `human-only` can close out automatically. Each
  auto-approval is written to the task activity log and can notify the bell
  (`auto-approved by policy: …`). **UI areas** still need a clean handoff
  verification gate (screenshots plus zero console/overflow issues recorded at
  handoff) — not just a green `repoos check`. Tag any task `human-only` to keep it
  on a human approval path.

## 5. Processes and servers

- RepoOS runs each managed agent turn in its own process group and reaps that group
  when the turn ends, so helpers the agent started during a turn are torn down with
  it. That does not replace good habits: agents should still avoid pattern kills.
- For an unattended RepoOS server on your machine, use `repoos service` (launchd /
  systemd) or a terminal tab you keep open — not a detached `repoos serve` started
  from an agent shell. A detached serve for this repo whose parent is gone is
  classified as a stray orphan and SIGTERMed by the control plane's periodic reaper
  (~every 30s). See `docs/agent-process-safety.md`.
- Never kill processes by name (`pkill -f vite`, `killall node`). It takes down
  every matching process on the machine, including other projects' servers. Stop
  only the PID you started, or let RepoOS reap the turn's process group.

## 6. Money and time

- Trust **provider-reported** usage only. RepoOS never estimates a dollar figure
  from token counts — a session that reported no cost shows **unknown** and stays
  out of every spend total. Set a **spend alert** in Settings → Notifications;
  the bell and **`GET /api/attention`** surface provider errors and threshold
  crossings alongside release and close-out notices.
- Expect roughly an hour of wall-clock for every three small tasks in a pipeline
  with review and close-out, and more for UI work with fix rounds.
- A long chat costs more with every turn because the whole history is re-read.
  Keep a short state and handoff note in the repo and start a fresh session at a
  milestone.

## 7. Close the loop

Log every surprise as you hit it: what happened, what you did, and what RepoOS
could do better, with the evidence. Triage that log into tasks. The fixes for the
sharpest edges above are exactly that kind of task.
