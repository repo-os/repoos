# AGENTS.md

This repo uses **RepoOS**: tasks are markdown files under `work/`, and the
repo itself is the source of truth. This file tells AI agents how to operate.

`AGENTS.md` is the cross-tool standard and the single source of truth here;
`CLAUDE.md` is a one-line shim (`@AGENTS.md`). Don't add per-tool files
(`CODEX.md`, `GEMINI.md`, …).

**Keep this file under 30 KB** — Codex truncates project docs at 32 KiB, Muse
Code at 64 KiB, and Claude Code warns near 40k characters, so anything past the
cut is invisible to those agents. A test enforces it
(`src/core/agents-md-size.test.ts`). Put history, incidents and long procedures
in `docs/` and leave a one-line rule plus a link here. See `docs/agents-md-size.md`.

Long-form versions of the rules below, with incident history:
[`docs/agent-workflow-rules.md`](docs/agent-workflow-rules.md),
[`docs/agent-ui-and-preview-conventions.md`](docs/agent-ui-and-preview-conventions.md),
[`docs/agent-debugging-and-incidents.md`](docs/agent-debugging-and-incidents.md).

## Who this file is for

- **RepoOS task-runner agents** — spawned by the RepoOS server for one task.
  You have a task id, a dedicated worktree and a transcript. The operating loop,
  the handoff request, the `::repoos-preview-request::` signal and "never run
  `repoos serve` yourself" are yours. **You never move your own task out of
  `active`.** Run the scoped check, then hand off with
  `repoos mv <your task id> review` (or end your reply with
  `::repoos-handoff-ready::`) and stop: both record a *request*, and RepoOS
  commits, validates and moves the status. Never write `status: review`
  yourself. Task metadata goes through RepoOS commands or APIs.
- **Interactive / external sessions** — a human drives you directly (Claude
  Code, Codex CLI, Cursor, Muse, …). No runner task id, no managed preview. If
  you work on a RepoOS task, its branch/worktree, review and close-out rules
  still apply (see below). To run the app use your harness's own tooling and the
  **Dev login** or auth-less dev server below.

## Where project knowledge goes: the repo, not your harness

If you learn something durable about this project, **write it into the repo**
— not into a harness-local memory store or private notes. Decisions and hard-won
lessons live in `docs/`, `work/` and `AGENTS.md`, legible to every agent and
human. Treat any harness memory as a cache of what the repo says.

| What you learned | Where it goes |
| --- | --- |
| A rule agents must follow, or the mistake repeats | This file — one or two lines |
| Why a design went the way it did; what an incident turned out to be | `docs/` |
| A decision that shaped the architecture | `docs/adr/` |
| Work that still needs doing | A task via `repoos new` — never a note-to-self |
| How a *user* of RepoOS does something | `user-docs/` |

Driving the board? Start with `repoos driver brief` and `docs/driver-notes.md`.
Re-read a task's live state (`repoos list`, `repoos landable <id>`) before every
action on it; never act on memory, summaries or loop prompts (#0879).

## Operating loop (managed task-runner agents)

1. Read this file, the assigned task in your worktree, and relevant `docs/`.
   Run `repoos list` for context; don't claim another task. Before reading a
   large file run `repoos outline <path>` (symbols with line ranges), then read
   just the range you need.
2. Work in the worktree and branch RepoOS assigned. Don't edit task frontmatter
   or create a second worktree.
3. Implement, and update docs directly affected by the change. Before handoff
   run `repoos check` once (typically `repoos check --changed main`) and confirm
   it passes — not after every edit (repeat runs create WIP checkpoint commits).
   `--fix` / `bun run fmt` runs the formatter first. Rebuild after UI changes.
   A queued check is normal: keep waiting; don't end your turn or treat the
   waiting badge as a request for input. RepoOS asks only for abnormal waits.
4. Request handoff with `repoos mv <id> review` or `::repoos-handoff-ready::`,
   then end your turn. Failure leaves the task `active` with the reason, queued
   for your next turn; `repoos handoff-status <id>` answers immediately. Don't
   call the blocking `repoos review <id>` from a runner turn.
5. Leave the worktree open and stop. Don't merge or mark done. Resume fixes on
   the same worktree if review sends it back.

## Review and sign-off (review → done)

**RepoOS owns this workflow, with or without a Git remote.** A GitHub remote
does not authorize opening a PR, pushing a task branch, or using GitHub
approval/merge instead of RepoOS, unless the human explicitly asks for that.

- A task in `review` awaits human sign-off; its branch has not landed. The
  reviewer agent is advisory: it never edits code, approves its own work or moves
  a task to `done`.
- On human approval use **Move to done**, `repoos done <id>` or
  `POST /api/tasks/:id/done`. It builds a candidate from current main, merges the
  branch, validates, publishes under a lock and records completion. See
  `docs/close-out-pipeline.md`, `user-docs/review-and-close-out.md`.
- **`repoos mv <id> done` is NOT this pipeline** — it only flips metadata and
  never merges. Never use it to land a branch or as an approval mechanism.
- **Check landability first:** `repoos landable <id>` (read-only; same list as
  the task drawer). It fails unless the review verdict is `good to go` on the
  current pass, the review lock sha equals worktree HEAD, the worktree is clean,
  the branch merges with main, the diff touches no `repoos.toml` or other tasks'
  `work/`/`inputs/stories` files, and main has no blocking dirty files.
- **Never close out human-gated work as if the human part were done.** A task
  with `needs_input_reason: needs-human-step` needs a real device, account,
  credentials or sign-up. Before closing out, make sure what's landing needs no
  human; file the human part first (`repoos new "<title>" --depends-on <id>` then
  `repoos update <new> --assigned-to human`, or `repoos split <id>`), narrow the
  original, then close out. If it can't be separated, don't close out — tell the
  human (#0660/#0784).
- `assigned_to: human` tasks are inert board work: plain status changes, no
  agents, checks, worktrees or close-out. Move their status only when the human
  asked.
- **`hold`** (`repoos hold <id> --reason "…" [--until <date>]`) makes a task inert
  to ALL automation (dispatch, CTO monitor, watchdog, crash recovery, queued
  messages). Only `repoos start <id> --force` or `repoos unhold <id> [--start]`
  starts it. It's broader than `pause`.
- **Integration conflicts:** if main moved and a reviewed task now conflicts,
  close-out tries a *narrow resolution* only for provably safe, purely additive
  conflicts, generated output, lockfiles or the task's own `work/<id>-*.md`, and
  only with a prior successful review. It fails closed. Never widen the allowlist
  in `src/server/conflict-resolution.ts` without a test proving the new class is
  behavior-preserving. Details: `docs/agent-workflow-rules.md`.

## Interactive / external sessions working on RepoOS tasks

Being outside a runner changes how you coordinate, not who owns approval and
merging.

- Use RepoOS commands or HTTP APIs for task creation and metadata. For an
  existing task use its recorded branch and worktree. Check for a live engineer
  or reviewer before editing; avoid concurrent writers.
- **Don't edit a task's worktree while it is in `review` or closing out**, even
  with no agent live: the branch tip is what was reviewed and what close-out
  merges; later edits aren't merged and block close-out. To change it, send it
  back to `active` through RepoOS first, or file a follow-up task. Check
  `.repoos/locks/<taskId>.json` (advisory). Only `work/*.md` bookkeeping commits,
  a conflict-free merge of main that equals git's own `merge-tree` result, or
  clean self-check WIP checkpoint commits are tolerated. (#0594, #0600, #0624,
  #0834.)
- If taking over a newly created task, claim it through RepoOS directly as
  `active`; don't leave it `ready` for auto-dispatch. Managed starts use the
  Start action, which owns worktree setup.
- Drive the server with the CLI, not ad-hoc `curl`: `repoos start|pause|message|
  review|done|override|preview|config|runners|agents|stats` (`user-docs/cli.md`).
  `repoos api <METHOD> /api/<path>` is the authenticated escape hatch. Every
  mutating API route needs a CLI command or a reasoned exemption in
  `src/cli/api-route-parity.ts`.
- Request review via the UI, `repoos review <id>` (waits for handoff) or
  `repoos mv <id> review` (asynchronous; a successful return is not proof checks
  finished).
- A status write doesn't synchronously cancel a background process. Use pause/
  stop and verify the run ended; wait for an active reviewer before close-out.
- After explicit human approval invoke `repoos done <id>`, Move to done or the
  API — not `mv done`. Don't bypass review with `active` → `done`, and don't
  repair a stuck task by reissuing `mv done`; inspect review/check/integration
  state. If the control-plane server is down, report it; don't emulate its
  lifecycle with task-file edits or manual merges.

### Commits to `main`

- **Agents never commit to `main` on their own initiative.** A direct commit is
  allowed only as a hotfix the human explicitly asked for in that conversation
  ("commit this to main"). One hotfix's permission doesn't carry over; if
  ambiguous, ask. Without that ask, leave work uncommitted or on a task branch.
  A hotfix authorizes that scope only — not hand-landing other task branches.
- Hotfixes must pass format and lint: run `bun run fmt` and `repoos check`
  before committing. `.githooks/pre-commit` (installed by `bun install`) enforces
  oxfmt/oxlint on `main`. **Never bypass it with `--no-verify`.** If
  `git config core.hooksPath` is empty, run `bun install`. The hook skips task
  branches, so run `bun run fmt` before committing there too.
- **Don't mention a modified `repoos.toml`.** The human edits it often; an
  uncommitted one is normal. Don't mention, stage or commit it unless you changed
  it yourself.
- Exception: if `repoos done <id>` refuses with "main has N uncommitted file(s)
  blocking close-out" and `repoos.toml` is the **only** dirty path, a driver may
  `git add repoos.toml` and commit it as `chore: checkpoint before close-out
  (#<id>)`, then retry; say so in your report. First check `git status --short` —
  RepoOS may already have done it. Never touch other dirty files or use
  `--no-verify`. (Automatic quota pauses live in gitignored
  `.repoos/budget-runtime.json` and don't dirty `repoos.toml`.)
- **Small fixes: bundle them as one `Easter eggs bundle: <themes>` task** rather
  than hotfixing or filing one task each. One open bundle at a time; 3–6 small
  independent items; never fold them into a release-critical task; file p2/p3.
  Workflow and body shape: `docs/easter-eggs-bundles.md` (#0822 is an example).

## Definition of done

Before a task moves to review `repoos check` must pass. It runs the plan in
`repoos.toml` (`[[check.steps]]`): build staleness, lockfile sync and the
zero-runtime-dependency guard, format + lint, full build, CSS layering /
theme-contrast / hard-coded-color / bare-`require()` / task-asset guards, the
test suite, a headless WebKit UI smoke test and a rendered contrast audit
(both skip cleanly if Playwright isn't installed).

- **If format/lint fails, run `repoos check --fix` (or `bun run fmt`), re-stage,
  re-run.** Build, tests and smoke are skipped until formatting is clean, and
  the close-out gate never auto-formats.
- Change the gate by editing the plan in `repoos.toml`, not
  `src/commands/check.ts`. A required step whose tool is missing FAILS.
- A scoped `repoos check --changed main` is a fast self-check, not the merge
  gate. Close-out runs changed-path tests plus always-run safety suites; release
  runs every test. See `user-docs/check.md`.
- `repoos check` doesn't catch docs gone wrong. Before review, check whether your
  diff contradicts a line in `AGENTS.md`, `docs/` or `user-docs/` (a moved path,
  changed behavior) and fix it — scoped to what the diff touches. Broad staleness
  sweeps are a separate periodic job; file findings as tasks.

## This repo is self-hosted — read before running anything

- `repoos` is likely a `bun link` dev build of THIS repo's `dist/`; it rebuilds
  and re-execs itself when `src/` is newer. After changing build scripts or
  package metadata run `bun run build` manually. `bun run build:ui` is for
  UI-only changes. After merging main into a task branch run `bun run build`
  before `repoos check` — a staleness failure means "not compiled yet", never a
  code problem.
- **`dist/` is gitignored — never `git add` or commit it.** A fresh task worktree
  has no `dist/` until something builds it; that's correct. Don't add steps to
  copy it.
- Changing the task file format, frontmatter schema or parser is SELF-MODIFYING:
  write a migration in the same change and verify the parser reads every file in
  `work/`.
- **Never run `bun add repoos` here** — circular; `package.json` lists only dev
  dependencies. Zero runtime dependencies is a hard constraint; add none without
  a task authorizing it.

## Rules

- **Never** move task files between folders; status lives in frontmatter.
- **Never write directly to `work/*.md`.** Use `repoos` commands or the HTTP API
  (`POST /api/tasks`, `PATCH /api/tasks/:id`). If the server is unreachable, stop
  and report — don't hand-write task files. The Product Manager agent may create
  and update tasks the same way. Keep frontmatter tidy (`repoos` normalizes key
  order). One task = one focused worktree.
- **Merging main into a task branch:** on a conflict in `work/<id>-*.md` take
  main's copy (`git checkout --theirs work/<id>-*.md`), stage, commit; don't
  pause to report it.
- A task's reports live in `work/reports/<id>/` (`round-<n>.json`,
  `review-<n>.md`); they are bookkeeping. Never hand-edit or delete a stored
  round or pass.
- **`repoos mv <id> done` never merges** (#0389/#0185 were marked done with
  unmerged branches). `cmdMv` refuses when the recorded branch isn't an ancestor
  of `main` unless `--force-not-merged`, but that's a backstop. Use Move to done.
- **Resource pressure: use RepoOS's `pressureGuard`, not your own thresholds
  (#0940).** Read its verdict from `repoos stats`, the dashboard banner,
  `repoos driver brief` or a task's queue marker (`reason: pressure`).
  **Never** block or defer starts with self-chosen numeric limits (a minimum free
  swap, a memory-pressure free %), and never start anyway under a different
  threshold. On macOS `vm.swapusage` "free" is unused swap capacity, and swap
  used/free alone isn't a pressure signal; `memory_pressure -Q` is one of the
  guard's inputs, not yours. When the guard holds a start, report its reason and
  wait; if its limits look wrong, ask the human to change Settings, and
  do not invent another gate. See `docs/memory-pressure-guard.md`.
- **Agent drivers pick from the budget allowlist.** `repoos override` /
  `cliOverride`/`modelOverride` refuse pairs outside `[[budget.allowlist]]` and
  paused pairs. `repoos override --help` lists allowed pairs;
  `repoos agents pause|resume <agent> [--model <m>]` manage pauses. Don't work
  around a refusal; ask the human.
- **Never `git add` binaries under `work/` or `inputs/`** (uploads land in
  gitignored `.attachments/`; the task-asset guard fails the gate).
- **Attach every image that came with a request** to the task:
  `repoos new "<title>" --screenshot path.png` (repeat per image) or
  `repoos update <id> --screenshot path.png` (`--caption` labels one). Never
  hand-copy into `.attachments/` or edit `## Screenshots` by hand. Say which you
  attached (#0763).
- **API-key features** follow `docs/api-keys.md`: register in `MODEL_PROVIDERS`
  with a fixed `envVar`, save only via `setDotEnvSecret` /
  `POST /api/model-providers/:id/key`, never write keys or env-var names into
  `repoos.toml`, masked UI with Saved / Not set only, fake values in tests, never
  paste live keys into tasks, chat or config (#0803).
- **Project secrets ≠ RepoOS credentials.** Project env files are plaintext
  dotenv, write-only via API/UI; only explicitly bound consumers receive values;
  no fallback to another environment; deployment bindings never upload values;
  `VITE_`/`NEXT_PUBLIC_`/`PUBLIC_` values may land in client assets. Preserve
  this in tests and `user-docs/environment-and-secrets.md`.
- **Every LLM call site must record usage** in the `sessions` table, including
  work with `taskId: null`. `AgentRunner` self-records; any one-shot
  (`runPrompt`) must call `recordOneShotSession(repoRoot, agent, result,
  { sessionType, taskId })` from `src/server/agents.ts` right after the await.
  Pick a legible `sessionType` (`dispatch`, not `pm`, for auto-engineering).
- **Don't widen the formatter's scope.** `.oxfmtrc.json` ignores `**/*.md` (keeps
  it off `work/*.md`) and `**/*.json` on purpose.
- **Every user-facing `repoos.toml` feature setting needs a Settings UI
  control** — add it to `getConfigSchema()` and the right Settings tab in the
  same change, with a test. Raw-TOML-only is for advanced/internal config, with
  the exception documented.
- **Explicitly authorized manual recovery only:** if the human directs you to
  hand-land a stale branch, check `git diff main...HEAD --name-only | grep -E
  '^(work|inputs|stories)/'` and `git checkout main -- <them>` before merging so
  other tasks' files aren't polluted (`docs/close-out-pipeline.md`).
- The AGENTS.md *template* that `repoos init` scaffolds lives in
  `src/commands/init.ts`. It is NOT this file; editing it ships to every new repo.

## Conventions

Full text: `docs/agent-ui-and-preview-conventions.md`.

- **Dropdowns:** use the custom styled dropdown; never a default `<select>`.
- **No native `alert()`/`confirm()`/`prompt()`** and no native `title` tooltips in
  new UI. Use the shared dialogs in `src/ui-app/src/components/ui/dialog/` and a
  styled, keyboard- and touch-usable tooltip/popover.
- **Areas are comma-separated, never `+`:** `--area web,core` /
  `area: [web, core]`, picked from the `[[areas]]` vocabulary in `repoos.toml`.
- **Creation drawers/panels** use the shared dialog components and the global
  `ff-*`/`field`/`btn-row` classes in `src/ui-app/src/style.css`, not bespoke
  scoped styles.
- **Pages use the full `.main` width** — no page-level `max-width` or centering;
  keep bottom clearance with `--page-bottom-inset` on the scrollport (#0602, #0951).
- **Label/value rows use aligned columns** via `.kv-rows` / `.kv-wrap` (#0623).
- **Any `position: fixed` or fullscreen overlay MUST be in `<Teleport to="body">`**
  (or a Radix `DialogPortal`), or it's trapped in the drawer's stacking context.
- **A body-teleported floating layer MUST carry `data-overlay-layer`** (#0575);
  hand-rolled overlays set `data-overlay-layer="floating"` on root and scrim,
  never on click-through decoration. Otherwise Radix's `pointer-events: none` on
  `<body>` makes it click-transparent.
- **Runtime: Bun.** Use `bun <file>`, `bun run`, `bunx`, `bun -e`; never `node
  <file>`, `npm run`, `npx`. New scripts get `#!/usr/bin/env bun`. Spawn with
  `process.execPath` or `bun`; fall back to `npm`/`node` only when Bun can't be
  launched, never because a Bun run failed. Node stays only where Bun may be
  absent (CLI entry shebang, launcher fallback, `scripts/run-tests.mjs`,
  `REPOOS_RUNTIME=node`, test fakebins), with a comment saying why. If Bun and
  Node differ for a tool, measure and record it in `docs/architecture.md`.
- **Tests:** `bun run test` (vitest), never bare `bun test` (its `vi` shim lacks
  `vi.stubGlobal` etc.). It's a two-pass wrapper; wall-clock timing tests run
  alone with `REPOOS_STRICT_TIMING=1` (`REPOOS_STRICT_TIMING=1 bunx vitest
  boot-timing`; `bunx`, not `npx`). Coverage is opt-in: `bun run test:coverage`.
- TypeScript, NodeNext: imports use `.js` extensions even for `.ts` source (this
  is correct). Build: `bun run build` is staleness-aware; `--force` or
  `REPOOS_FORCE_BUILD=1` forces; raw pipeline is `bun run build:raw`.
- Layout: `src/core` (engine), `src/server` (HTTP + SSE), `src/cli` +
  `src/commands` (CLI), `src/ui-app` (Vite + Vue 3 SFC UI). Routes are in
  `src/ui-app/src/router.ts`, views in `views/*View.vue`, nav in `nav.ts`.
  Dialog CSS lives in `style.css`, not the view's scoped block.
- After ANY UI change rebuild (`bun run build:ui` or `bun run build`). Don't
  request a preview to verify it routinely; previews are on the human's request
  (#0268).
- **`repoos shot`:** at handoff the server captures declared `## Shots` itself
  (and one auto shot per touched UI target). Your job is to DECLARE what a review
  should see: `repoos update <id> --shots '<JSON list>'` (1–3 entries with
  `target`, `route`, optional `selector`/`state`/`steps`/`highlight`, and a
  `label`). Prefer routes and `state` fixtures over brittle click steps;
  `?tab=<id>` for tabs, `/work?task=<id>&tab=changes` for drawers. On declared
  shots a missing `highlight`/`selector`/step target fails handoff; app routes
  and `state` fixtures only render on the `default` app target; a stale capture
  (tree ≠ branch HEAD) isn't shown as matching, so re-run on the final tree.
  Details: `docs/agent-ui-and-preview-conventions.md`.
- **Previews are server-owned — never run `repoos serve` yourself.** Only the
  human requests a preview. If asked to verify like a browser, emit
  `::repoos-preview-request::` (idempotent; server-side HTTP probe, no login;
  one preview at a time, may evict another task's). For logged-in clicking use
  Dev login.

## Dev login (skip the email OTP)

Auth is on by default locally. Log in as `hello@repoos.org` (the
`bootstrapAdmin`; arbitrary addresses don't work) with the code from
`grep REPOOS_AUTH_DEV_BACKDOOR_CODE .env` (gitignored `.env`; env-var only, never
in `repoos.toml`, ignored when `NODE_ENV=production`). Wiring and background:
`docs/native-auth.md`. Task-runner agents: for "does it serve?" prefer the
server-side probe; use this only when the human wants the logged-in UI clicked.

**Auth-less dev server (interactive sessions):** `just serve-noauth [port]`
(default 7272, 127.0.0.1 only, no login; stop with
`pkill -f "serve --preview-overrides --port <port>"`). **Run it from a task
worktree or scratch worktree — never from the checkout the real `repoos serve`
is serving:** two servers on one root both watch `work/` and spawn duplicate
reviewers. Check the directory first (a failed `cd` leaves you in main) and
confirm the startup log shows `mode: "preview"`.

## Debugging: search the error, then check the versions

When an error is *weird* (makes no sense given the code, or the same code behaves
differently in two places), stop theorising and: (1) **search the exact error
text on the web**; (2) **check versions of the runtime** — `node --version`,
`bun --version`, and *which binary actually runs* (`process.execPath`,
`which node`). "Works here, fails there" is a version difference until proven
otherwise; reproduce under the exact runtime the failing system uses (e.g. the
gate runs under the server's Node, not your shell's). Be suspicious of any
"flaky" diagnosis for a failure that reproduces identically twice. When a test's
verdict flips with runtime speed, remove the race rather than reconcile the
environments. Worked examples (#0205, #0271, #0330):
`docs/agent-debugging-and-incidents.md`.

**Is a `repoos check` failure a flake or a real bug?** If it reproduces in
isolation on an idle machine, it's real. Run the whole suite, not just the first
failing file. Distrust exact-count assertions on streamed agent output — they
fail as *timeouts*. There is a real memory-pressure flake, so it's a judgement
call; read `docs/debugging-check-failures.md` before spending an afternoon on
a failure you can't explain.

## Git setup: don't let a failed command skip branch creation

- Don't chain git SETUP commands with `&&` so one failure silently skips branch
  creation (a past agent's failed `git pull` meant work landed on `main`). Create
  the branch as its own step and confirm it.
- Don't `git pull` when branching from local `main`: `git checkout main`, then
  `git checkout -b <branch>`.
- Before your FIRST commit verify `git branch --show-current`. Don't commit on
  `main` for normal task work (an explicitly requested hotfix is the exception).
- Managed task worktree creation is RepoOS's job (Start action); don't hand-roll
  a second worktree.

### Edit the task worktree, not the checkout your tools start in

Your tools' working directory is usually still the **main checkout** even after
RepoOS created the task's worktree, so relative-path edits land on `main` while
the task branch sits untouched, with no error (two harnesses did this on
2026-10-01). Before your FIRST edit run `pwd` and use the worktree's **absolute
path** for every file/edit tool; a `cd` isn't enough when the tool's root is
fixed at session start.

For a remote-runner engineer session (ADR `docs/adr/0009-remote-engineer-sessions.md`)
the real worktree is on that host and the laptop copy is a fetched mirror: don't
edit the mirror, run shell work through the runner, and remember `repoos
check`/handoff read the fetched local branch. If fetch-back reports a diverged
tree, stop and surface it — never reset or force-push around it.

## Stuck-active incident (#0151): worktree missing its own task file

If finalization fails with `task file is missing from the registered worktree`,
`ensureWorktree` (`src/core/git.ts`) should have healed it by copying main's
task file into the worktree. If you still see it, that's a bug in the heal: file
it against `ensureWorktree`, confirm with `git ls-tree <worktree-branch> --
work/<file>.md`, and **don't copy the file in by hand.** A worktree's own task
file lagging main's frontmatter (`status`, `branch`, `updated_at`) is expected and
doesn't block review/done. Root cause and history:
`docs/agent-debugging-and-incidents.md`.
