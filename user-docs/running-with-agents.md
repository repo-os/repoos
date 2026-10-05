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
- Encode the order with `dependsOn`. The sequencing judgment belongs **here**,
  at planning time. Once the graph is right, "which task next?" is almost
  mechanical: priority first, then the longest chain of work it unblocks, then
  age.
- Put the context agents need where they will read it: an index file in your docs
  directory with a reading order, a short block of hard rules in `AGENTS.md` that
  points at it, and a glossary of your domain words. Keep reference code and
  legacy material out of the build. Never put real data or secrets in the repo or
  in task text.

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
- Run at most **two tasks at once** on a laptop. If you have
  [remote runners](/configuration#remote-validation), watch the notification bell
  for **Ran locally** when remote validation was on but the gate ran on this
  machine — and use **`GET /api/attention`** (or the `attention.updated` SSE
  event) instead of polling job files by hand.
- Keep the primary checkout **clean**. Commit configuration and bookkeeping
  writes straight away, or **Move to done** will refuse.
- Close-out candidates reuse the primary checkout's `node_modules`. After any
  merge that changes the lockfile, install dependencies in the primary checkout,
  or the next task's close-out can fail on missing modules.

## 4. The review loop

- Read the reviewer's report, then **look at UI work yourself**: open the task
  preview, log in, check the browser console, and check phone, tablet and desktop
  widths. Automated checks and LLM reviewers pass UI defects that a human sees in
  seconds — a blank map, a chart drawn wrong, a page wider than the window.
- A task preview runs the branch's web code against the primary checkout's API.
  A change that touches both sides can only be fully verified after it merges.
- Feedback that must survive a change of engineer session (a different CLI or
  model) belongs in the **task body**. A message lives only in the session it
  was sent to, and the review report file is overwritten on each pass.
- Approve only after you have seen it work. Approval is a human decision.

## 5. Processes and servers

- Run the server in a real terminal tab or with `repoos service`, not as a
  detached child of a short-lived agent shell; those get reaped.
- Never kill processes by name (`pkill -f vite`). It takes down every matching
  process on the machine, including other projects' servers. Start helpers on a
  free port and stop only the PID you started.

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
