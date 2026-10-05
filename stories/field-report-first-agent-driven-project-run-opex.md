---
name: "Field report: first agent-driven project run (opex)"
number: "0008"
created_at: "2026-10-05T17:16:26.404Z"
created_by: "claude-driver (opex run, 2026-10-05)"
---
This story is the shared background for the tasks that came out of the first real, end-to-end agent-driven RepoOS project run. Read it before working any task listed below: it explains why the work exists, what was observed, what the owner already decided, and what you should not have to rediscover.

## What happened

On 2026-10-05 (about 9 hours wall-clock) an AI agent (Claude, acting as the human "driver" while the owner watched and steered) built a real project from scratch with RepoOS and cheap coding agents, to see what a real first-time user hits.

- **Project:** "opex", Jago's geospatial operations dashboard (coffee-cart operations in Jakarta). Vue 3 + Vite + Tailwind + maplibre front end, Bun + Hono API, Postgres/PostGIS, ETL jobs. Synthetic data only. Four dashboards, a themed responsive shell, fake login, a data-status page and an analytics kit.
- **Scale:** 29 tasks (21 planned up front, 8 added mid-run to unblock the pipeline), 182 agent sessions, about 11.7 agent-hours, **$3.87** of provider-reported spend.
- **Agents:** engineer = pi then opencode, both on DeepSeek V4.1 Flash (OpenRouter, then DeepInfra after the OpenRouter credit ran out); reviewer = Cursor Composer 2.5; PM, CTO, Ross, debugger on free opencode models; remote runners configured on a tailnet pool (never actually used, see below). Hard tasks were moved to Cursor with a per-task override.
- **Driver role:** the driver wrote the project docs and the task backlog (dependency-ordered), started tasks, read every review, opened each UI task's preview in a real browser, approved or sent work back, and logged every surprise with evidence. A helper script handled scheduling and wake-ups.
- **What worked:** the handoff, auto-format, check and automatic review loop is solid once agents are configured; the auto-bounce fixes real review findings; task previews and shots make visual verification cheap; cheap models are fine for scaffolding and pure logic.
- **What cost the most time:** environment failures at close-out reported as code failures, the server and dev servers being killed, four UI defects that passed every automated check, a poisoned cost number, and discovering the new-project path by accident.

## The tasks in this story, by theme

| Theme | Tasks |
| --- | --- |
| Starting a project (init) | 0670 non-interactive flags (done), 0671 starter tasks (done), 0672 agent docs (done), 0673 docs import incl. zip |
| Close-out and environment | 0674 dependency handling, 0679 timeouts, conflicts and hand-back |
| Agent and process safety | 0675 no pattern kills, 0677 read-only board agents and real error messages, 0678 provider failures and silent runs |
| Cost and accounting | 0676 cost accounting |
| Verification quality | 0680 UI verification gate and review history, 0681 full-stack previews and config reload |
| Configuration and hygiene | 0682 config/git hygiene, 0684 per-task override ergonomics, 0685 papercuts |
| Remote runners | 0683 remote validation |
| Running a project well | 0686 approval policy, 0687 attention queue, 0688 CTO safe actions, 0689 playbook page (page landed on main), 0690 scheduling, 0691 give agents the story context |

Do not duplicate a sibling's work: if your task touches the same code as another in this list, read that task first and coordinate through the task notes.

## Facts already established (do not re-derive; verify against current source before relying on them)

**Init.** The starter task is chosen by code path, not repo contents: the guided new-project flow (only outside a git repo, needs a TTY) seeds "Flesh out the product vision"; any `repoos init` inside a git repo, even an empty one, seeds "Read this codebase" (`scaffoldInto(..., "existing")`). Both starters were seeded `ready`, so anything that auto-starts ready tasks picks them up. The guided flow works through a pseudo-terminal. Task 0364 chose `ready` on purpose; the owner has since decided starters must be `inbox`/`draft`, marked `created_by: repoos-init`.

**Close-out candidates and `node_modules`.** Candidates symlink the main checkout's root `node_modules`. A candidate gets its own install only when its branch changes package inputs (#0449). Consequences seen: (1) main's install goes stale after a dependency-adding merge, so the next candidate fails to resolve modules; (2) Bun's default per-package `node_modules` are invisible through the root symlink (worked around with a hoisted linker); (3) Vite's fs guard rejects imports whose real path is outside the candidate (`Denied ID`). All were reported as "a real failure in the branch, not machine load". RepoOS itself rarely trips this (single package, zero-runtime-dependency rule).

**Gate speed and timeouts.** A small 3-package monorepo gate took 266 s for typecheck alone under load; default `closeOut.timeoutMs` is 6 min and is wall-clock (sleep counts). Heavy test fixtures were the real cause; after trimming them close-out took 20-50 s.

**Cost accounting.** `estimateCostUsd(tokens)` is `tokens x $9 / 1M` and is used when a session has `totalTokens` but no reported cost. `totalTokens` includes cache reads, so one aborted 32-second session on a cheap cached model was recorded as $25.29. Real provider-reported spend was $3.87 for the whole run.

**Process kills.** Engineer agents ran `pkill -f "vite"` and `pkill -f "bun --watch ..."` repeatedly. These match every process on the machine and killed the owner's dev server. Detached `repoos serve` processes started from an agent shell were SIGTERMed within about a minute; the cause was not identified.

**Overrides and sessions.** `cliOverride`/`modelOverride` take effect only through `PATCH /api/tasks/:id`; sending them to `/start` or `/message` returns 200 and is ignored. Findings sent by message live only in that engineer session; the review report file `.repoos/reviews/<id>.md` is overwritten each pass (latest only).

**Verification.** Four UI defects passed unit tests, `repoos check` and the LLM review (a map that never loaded its worker, mini-bars drawn on top of each other, an invalid map expression that drew no points, a page 1,542px wide at a 1,024px viewport). A human opening the task preview caught all four. The task preview runs the branch's web code against the main checkout's API, so a change that spans both cannot be verified there.

**Notices.** The notification bell already lists close-out outcomes, release events and "Tasks needing you". Missing: provider/credit failures, spend thresholds, "awaiting human visual check", remote-fallback notices, and one machine-readable feed.

**Remote validation.** Hosts passed RepoOS's own prerequisite test but no close-out ever dispatched remotely, and the status endpoint still showed every host unprobed. `repoos-ci` is the RepoOS repo's own image (the in-container command is fixed and there is no Postgres); a project with a database needs its own image, which must pass through when run as root because the pre-flight does `docker run -u 0 <image> chown ...`.

**Features the owner asked the driver to use.** The CTO ran 91 sessions and reported "nothing to report" almost every time (once it wrote a junk file into main). The Debugger ran zero sessions because its separate built-in toggle (`builtInAgents.debugger.enabled`) was off while its agent row was configured. Stories were created but not used to steer the work. Engineers do not receive story text in their prompts (task 0691).

## Owner decisions already made

- Starter tasks: `inbox`/`draft`, never `ready`; `created_by: repoos-init`; choose the starter by repo contents; headless flags for the new-project flow.
- Starter docs: opt-in only. Docs import accepts a directory, a file or a `.zip`, with an interactive prompt; no saved default path.
- The playbook page "Running a project with AI agents" is on main (user-docs/running-with-agents.md). Task 0689 only tracks the remaining pointers and re-verification.
- Cost: never trust estimates; exclude them from totals and guardrails.
- Approval stays a human decision by default. Any auto-approval is opt-in, per area, with an audit trail, and never for UI work without clean evidence.
- Filing everything as `inbox`: the owner chooses what to start.

## Known uncertainties

- Why detached servers died (task 0675 should find out rather than assume).
- Whether the watchdog counts system sleep as a stall (the owner's laptop may have slept during the one 32-minute silent run).
- Whether remote hosts are only probed while the Remote runners tab is open (hypothesis from the docs, unverified).
- The inflated `queuePosition` after Move to done (unverified).

## Evidence

Numbered observations (39 items, with severity, exact error text and suggested fixes), corrections, a driver action log and a scorecard are in the opex repo: `~/code/jago/opex/repoos/docs/repoos-feedback.md`, with the operating loop in `~/code/jago/opex/repoos/docs/session-handoff.md`. The project itself is `~/code/jago/opex`.

## How to use this story

1. Read your task, then the "Facts already established" section for your theme.
2. Verify those facts against the current source before you rely on them; code may have changed since.
3. Keep fixes small and tested, reproduce the reported behaviour first when you can, and note in the task what you verified.
4. If you find the evidence here is wrong or incomplete, say so in the task notes so the story can be corrected.
