# AGENTS.md

This repo uses **RepoOS**: tasks are markdown files under `work/`, and the
repo itself is the source of truth. This file tells AI agents how to operate.

`AGENTS.md` is the cross-tool standard and the single source of truth here.
Codex, Cursor, Aider, Zed and friends read it directly; `CLAUDE.md` is a
one-line shim (`@AGENTS.md`) so Claude Code picks it up too. Don't add a
per-tool file (`CODEX.md`, `GEMINI.md`, …) — add a shim only if a tool you
actually use ignores both.

## Who this file is for

Two kinds of agent read this file, and some rules apply to only one:

- **RepoOS task-runner agents** — spawned by the RepoOS server to work a
  specific task. You have a task id, a dedicated worktree, and a task
  transcript. The managed operating loop below, the handoff request, the
  `::repoos-preview-request::` signal, and "never run `repoos serve` yourself"
  are all yours — the server enforces them and rejects
  direct serve attempts from your process. **You never move your own task out of
  `active`.** Run the scoped check, then hand off with
  `repoos mv <your task id> review` (or by finishing your reply with the
  `::repoos-handoff-ready::` signal) and end your turn: both record a *request*,
  and RepoOS commits the branch, runs the checks and moves the status itself.
  Do not write `status: review` directly: the watcher can intercept that write
  and finalize it before your turn ends, cutting the turn short. Task metadata
  must go through RepoOS commands or APIs.
- **Interactive / external agent sessions** — a human is driving you directly
  (Claude Code, Codex CLI, Cursor, …) in an ordinary checkout. You have no
  runner task id and no managed preview. Runner-only signals and transcripts
  do not apply. If you work on a RepoOS task, its branch/worktree, review and
  close-out rules still apply; see the interactive-session section below.
  To run or verify the app, use your own harness's tooling (e.g. Claude
  Code's preview/browser tools, which may launch the dev server defined in
  `.claude/launch.json`) and get past the login screen with the **Dev login**
  below.

## Where project knowledge goes: the repo, not your harness

**If you learn something durable about this project, write it into the repo.**
Not into a harness-local memory store, a per-tool scratchpad, or a private
notes file that only your agent framework can read.

That is the entire premise of RepoOS: a project's decisions, context and hard-
won lessons live in `docs/`, `work/` and `AGENTS.md`, versioned alongside the
code, legible to **every** agent, harness and human who touches the repo —
including the next model, the next tool, and you six months from now with no
session history.

Knowledge kept in a harness-only memory is invisible to everyone else, and the
same mistake gets made again by the next agent. This has already happened here:
several real incidents (dropped merges, check-gate misdiagnosis, task-file
drift) sat in one assistant's private memory for weeks while other agents
rediscovered them the hard way. Those are now in `docs/` where they belong.

Where to put what:

| What you learned | Where it goes |
| --- | --- |
| A rule agents must follow, or the mistake repeats | This file (`AGENTS.md`) |
| Why a design went the way it did; what an incident turned out to be | `docs/` |
| A decision that shaped the architecture and rules things out | `docs/adr/` |
| Work that still needs doing | A task, via `repoos new` — never a note-to-self |
| How a *user* of RepoOS does something | `user-docs/` (this repo only) |

This applies in any repo running RepoOS, not just this one. If your harness has
its own memory feature, treat it as a cache of what's already in the repo, not
as the system of record — and prefer writing to the repo first.

`docs/` holds build context for the project it lives in. In this repo that is
RepoOS's own; in a managed repo it is that project's. See `docs/README.md`.

## Operating loop (managed task-runner agents)

1. Read this file, the assigned task in your worktree, and relevant `docs/`.
   Run `repoos list` for board context; do not claim another task. Before
   reading a large file, run `repoos outline <path>` — it prints the file's
   symbols with start-end line numbers, so you can read just the range you
   need (`offset`/`limit`) instead of the whole file.
2. Work in the dedicated worktree and branch RepoOS assigned. The server has
   already activated the task and created or reused its worktree. Do not edit
   task frontmatter or create a second worktree for it.
3. Implement the task and update docs directly affected by the change. Before
   handoff, run `repoos check` once (typically `repoos check --changed main` or
   `REPOOS_CHECK_CHANGED=main repoos check`) and confirm it passes — not after
   every edit; repeated runs create WIP checkpoint commits on the task branch.
   When `remoteValidation` is enabled, that scoped check runs install + build +
   changed-path tests on the runner and fast guards locally; handoff still runs
   the full suite on the runner before merge. Add `--fix` (or just `bun run fmt`)
   to run the `format` step's fixer before the check; handoff also does this and
   commits the result itself. Rebuild after UI changes.
4. Request handoff with `repoos mv <id> review` or finish your reply with
   `::repoos-handoff-ready::`, then end your turn. In your own runner session,
   both record a request without changing status. RepoOS commits the branch,
   runs validation, verifies that the tested tree stayed unchanged, and only
   then moves the task to `review`. Failure leaves it `active` with the reason.
5. Leave the worktree open and stop. Do not merge the branch or mark it done.
   Resume fixes on this same worktree if review sends it back.

## Review and sign-off (review → done)

**RepoOS owns this workflow whether or not the repo has a Git remote.** A
GitHub remote does not authorize opening a PR, pushing a task branch, or using
GitHub approval/merge instead of RepoOS. Only do those if the human explicitly
requests that separate workflow.

A task in `review` awaits human sign-off; its branch has not landed. When
configured, the reviewer agent reads the diff in the task worktree and writes
an advisory report shown beside **Move to done**. It does not edit code,
approve its own work, or move the task to `done`. Findings can send the task
back to the engineer for fixes and another handoff.

When the human approves, use **Move to done** in RepoOS or
`POST /api/tasks/:id/done`. An explicit instruction to complete a normal task
means invoke that pipeline, not merge it by hand. RepoOS creates a candidate
worktree from current main, merges the feature branch there, validates the
combined result, rechecks main under a publication lock, publishes, cleans up,
and records completion. Dirty work is preserved, and failures remain visible
for repair/retry. See `docs/close-out-pipeline.md` and
`user-docs/review-and-close-out.md`.

`repoos mv <id> done` is **not** this pipeline: it only changes task metadata.
Never use it as a substitute for landing a branch through Move to done.

## Interactive / external sessions working on RepoOS tasks

Being outside a managed runner changes how you coordinate with RepoOS, not
who owns approval and merging:

- Use RepoOS commands or HTTP APIs for task creation and metadata changes.
  For an existing task, use its recorded branch and existing worktree. Check
  for a live engineer or reviewer before editing; avoid concurrent writers.
- **Do not edit a task's worktree while the task is in `review` or closing out
  (Move to done running), even when no agent is live.** The branch tip is what
  was reviewed and what close-out merges; anything written to the worktree
  after handoff is not merged, and close-out then keeps the dirty worktree and
  stops for input. To change a task in review, send it back to `active`
  through RepoOS first (then hand off again), or file a follow-up task. If you
  find you must fix something you spotted, commit it on the branch only as a
  proposal and file a task for it; never leave it uncommitted. RepoOS also
  writes `.repoos/locks/<taskId>.json` while a task is in `review` or
  close-out (advisory — runners refuse to start there; external sessions
  should check it too). Move to done compares the worktree to the handoff
  snapshot and refuses when HEAD moved or the tree is dirty after handoff,
  except commits that change only `work/*.md` task files (RepoOS bookkeeping or
  a main sync bringing in other tasks' task files — #0600), and a conflict-free
  merge of main into the branch that is exactly what git computes on its
  own (the committed tree equals a `merge-tree` replay of the merge's parents; hand
  resolutions or edits slipped into the merge still fail — #0624). Real source edits still block close-out. Incident: 2026-09-30, #0594 — four files edited
  mid-close-out never landed.
- If explicitly taking over a newly created task, claim it through RepoOS
  directly as `active`, without leaving it in `ready` for auto-dispatch to grab.
  Managed starts should use RepoOS's Start action, which owns worktree setup.
- Drive the running server from the CLI, not ad-hoc `curl`: `repoos start`,
  `pause`, `message`, `review` (synchronous handoff), `done` (close-out),
  `override`, `preview`, `config`, `runners`, `agents`, and `stats` wrap the
  HTTP API with one-shot auth (loopback token or stored session; dev-login
  re-auth on 401). See `user-docs/cli.md` (Control plane).
- Request review through the UI, `repoos review <id>`, or `repoos mv <id> review`.
  `repoos mv review` writes task metadata that the server intercepts
  asynchronously; prefer `repoos review` when you need to wait for handoff
  completion. A successful `repoos mv` return is not proof that checks finished.
- A status write is not a synchronous cancellation of a background process.
  Use the supported pause/stop action and verify the run has ended before
  taking over. Wait for an active reviewer before requesting close-out.
- After explicit human approval, invoke `repoos done <id>`, Move to done in the
  UI, or `POST /api/tasks/:id/done` — not `repoos mv <id> done`.
  Do not bypass review with `active` → `done` or repair a stuck task by merely
  reissuing `repoos mv <id> done`. Inspect the review/check/integration state.
  If the control-plane server is unavailable, report it rather than emulate
  its lifecycle with task-file edits or manual merges.

**Explicit direct-to-main hotfixes are a separate exception.** If the human
specifically asks for a direct commit on main (as opposed to completing a
branched task), follow that scope and the main-commit checks below. This does
not authorize hand-landing other task branches. If such already-landed work
has a branchless task record, `/done` has a separate checked release path for
it: it checks main and records release without a candidate merge. Do not erase
a task's branch metadata to force that path.

**Caveat: agents never commit to `main` on their own initiative.** Direct commits
to `main` are allowed only as a hotfix the human explicitly asked for in that
conversation (e.g. "commit this to main"). Permission for one hotfix does not
carry over to later changes, and an ambiguous request is a reason to ask, not to
commit. Without that explicit ask, leave work uncommitted or put it on a task
branch.

**Don't mention a modified `repoos.toml`.** The human edits it for many reasons,
so an uncommitted `repoos.toml` in `git status` is normal, not news. Never
mention, ask about, stage or commit it unless you changed it yourself and need
to tell the human. If you did, say so plainly. Otherwise leave it alone and say
nothing.

**Historical caution (2026-09-16):** external CLI status writes raced a live
reviewer, which later reverted a task from `done` to `review`. The old advice
to avoid that race by skipping review or reissuing `mv done` is not the current
workflow. The lesson is to coordinate through server actions, wait for actual
completion, and keep merging and status changes in the close-out pipeline.

## Definition of done

Before a task moves to review, `repoos check` must pass. It runs the check plan
this repo declares in `repoos.toml` (`[[check.steps]]`, #0446) — for RepoOS
that is:
- Build staleness check (`src/` vs `dist/`)
- Lockfile sync (`bun.lock` vs `package.json`) and the zero-runtime-dependency guard
- Formatting & lint (`oxfmt --check` + `oxlint`) — **if this fails, run `repoos check --fix` (or `bun run fmt`), re-stage, and re-run `repoos check`**; build, tests and smoke are skipped until formatting is clean (they `dependsOn` it). The close-out gate never auto-formats, so an unformatted committed tree still fails there
- Full build (`tsc` + asset copy), CSS layering and theme-contrast guards, hard-coded-color source guard (`hardcoded-colors`), bare-`require()` guard, task-asset guard
- Test suite
- Headless browser UI smoke test (WebKit) — verifies the app mounts, no unrendered mustache in the DOM, and zero console errors
- Rendered contrast audit (`bun run contrast:audit`, also headless WebKit) — every theme scope × light/dark across board, drawer tabs, Agents, Settings, Context and toasts; fails any visible text under the WCAG floor, with `[[check.contrastExempts]]` as the central allowlist (#0596, `docs/contrast-audit.md`)
- The smoke test and the contrast audit **skip with a clear message** if Playwright or the browser binary isn't installed

Change the gate by editing that plan in `repoos.toml`, not by editing
`src/commands/check.ts`: a step is `name` + `command` (or a built-in `kind`),
plus optional `fix`, `cwd`, `timeoutMs`, `required`, `profiles`, `whenChanged`,
`requires`, `dependsOn`. A required step whose tool is missing FAILS with
install advice — only an explicitly optional or excluded step may skip.
Close-out runs the full profile; a scoped `repoos check --changed main` (or
`REPOOS_CHECK_CHANGED`) is a fast engineer self-check — remote validation runs
changed-path tests on the runner when enabled — not the merge gate. See
`user-docs/check.md`.

`repoos check` only catches code breakage — it says nothing about whether this
task's diff just made a doc wrong. Before moving to review, also check: does
this change contradict a line in `AGENTS.md`, `docs/`, or `user-docs/` — a
path that moved, a behavior that changed, a constraint that no longer holds?
If so, fix that line as part of this task. Scope it to what the diff actually
touches; do not go looking for unrelated staleness elsewhere in the docs —
that is a separate, periodic audit concern, not this task's job, and turning
a scoped fix into a drive-by audit is scope creep the same as any other.

## Docs and context can go stale — inline scope vs. periodic audit

Two different mechanisms keep `AGENTS.md`/`docs/`/`user-docs/` honest, and
they are not substitutes for each other:

- **Inline, scoped, every task** — the Definition of done bullet above. An
  implementing agent has the diff in hand and near-zero marginal cost to
  check it against the docs it directly touches. This catches drift the
  moment it's introduced.
- **Periodic, broad, separate** — nothing in a single task's context is
  positioned to notice a doc describing a feature nobody's touched in
  months, or an `AGENTS.md` rule that quietly stopped being true. That needs
  a sweep with the whole repo in view, on its own schedule. Compare docs and
  agent instructions with each other and with the current implementation;
  distinguish historical incident accounts and explicit exceptions from
  current operating rules. File findings as tasks unless the human explicitly
  authorizes fixes in that sweep. Use the same task-creation path as everything
  else — see "Never write directly to `work/*.md` files" under Rules. This is intentionally a separate, narrowly-scoped agent concern
  from general tech-debt/code-quality review — conflating the two produces a
  vague mandate and noisy, low-signal findings.

## This repo is self-hosted — read this before running anything

RepoOS manages its own roadmap. This means a few things are true that you
cannot tell from the code alone:

- The `repoos` command is very likely a `bun link` dev build pointing at THIS
  repo's `dist/`. It runs compiled JS, not the TypeScript source. On startup,
  it compares a hash of `src/` with `dist/.build-info.json`. When a marked
  build is stale, it runs `bun run build` and re-execs the same command so the
  command uses fresh compiled code. This applies to `repoos check` and `serve`
  too. The re-exec is attempted once; a failed build or still-stale marker
  falls through to the existing warning or `check` staleness failure. A
  manual `bun run build` is still useful before using the compiled CLI after
  changing build scripts or package metadata, which the `src/` hash does not
  cover. `bun run build:ui` is available for UI-only changes.
- **`dist/` is gitignored (as of 2026-08-15) — never `git add` it, and never
  `commit` it.** It used to be tracked, and that alone was the #1 source of
  merge conflicts and dirty-`main` failures in this repo — see
  `docs/dogfooding-vs-general.md` for the full history. If a task, a script, or
  your own instinct tells you to commit regenerated `dist/`, that instruction
  is stale; do not follow it. `dist/.build-info.json` (`{ hash, version }`) is
  deterministic and gitignored along with everything else in `dist/`; a
  rebuild of unchanged source produces zero `git status` output, not "an
  unchanged tracked file" — there is nothing there for git to see at all.
- **A fresh task worktree has no `dist/` until something builds it, and that
  is correct, not a bug.** `repoos check` always builds fresh regardless; the
  preview path builds on demand when one is missing. Do not add a step to
  copy or commit `dist/` into a new worktree "to fix" this.
- Editing the task file format, frontmatter schema, or the parser is a
  SELF-MODIFYING act: it affects this repo's own `work/*.md` files, including
  the task you are working on. If you change the format, write a migration in
  the same change and verify the parser still reads every existing file in
  `work/`.
- **Never run `bun add repoos` in this repo.** It is RepoOS — depending on
  itself is circular and will break installs. Its `package.json` lists only
  dev dependencies.

## Rules

- **Never** move task files between folders. Status lives in frontmatter.
- **Never write directly to `work/*.md` files.** All task creation and
  manipulation goes through `repoos` commands or HTTP API endpoints
  (`POST /api/tasks`, `PATCH /api/tasks/:id`, etc.). If the RepoOS server
  is unreachable, stop and report the issue — do not hand-write task files.
- **The Product Manager agent is authorized to create and update tasks.** It
  must use those same RepoOS CLI commands or HTTP API endpoints for task body,
  metadata, and status changes; it must never edit task Markdown directly.
- **`repoos mv <id> done` never merges code — it only flips the status
  frontmatter.** Confirmed live twice in one session (2026-09-17): #0389 and
  #0185 were both marked `done` this way while their actual branches sat
  unmerged on `main`. The server's own HTTP `PATCH /api/tasks/:id` route
  already refuses a bare `status: "done"` for exactly this reason and forces
  callers through `POST /api/tasks/:id/done` (the real close-out pipeline,
  see `docs/close-out-pipeline.md`) — but the CLI command bypasses the server
  entirely, so nothing stopped it from silently doing the wrong thing. `cmdMv`
  (`src/commands/tasks.ts`) now refuses to move to `done` when the task's
  recorded `branch` still exists locally and is not an ancestor of `main`,
  unless `--force-not-merged` is passed — but that guard is a backstop, not a
  substitute for doing this correctly. For normal branched tasks, use the
  server-owned Move-to-done pipeline even from an interactive session. A bare
  `mv done` is at most a metadata repair after separately verified landing and
  explicit human authorization; it is never a merge or approval mechanism.
- Keep frontmatter tidy; `repoos` normalizes key order on write.
- One task = one focused worktree.
- **Never `git add` binaries under `work/` or `inputs/`.** Task and input
  screenshot uploads land in `work/.attachments/` / `inputs/.attachments/`,
  which are gitignored and served by the running server from disk — the
  committed record is the `.md`, never the pixels. `repoos check`'s task-asset
  guard fails the gate on any tracked image/PDF under those two trees. Product
  image assets (UI, icons, logos, `docs/`) live elsewhere and stay tracked.
- Zero runtime dependencies is a hard design constraint. Do not add a runtime
  dependency without an explicit task authorizing it. Dev dependencies (test
  runners, types) are fine.
- **Every LLM call site must record its usage.** All AI spend belongs in the
  `sessions` table, including work not tied to a task (board-level doc
  authoring, the auto-engineering dispatch pass, CTO) — those record with
  `taskId: null` and still roll into the board summary. The `AgentRunner` path
  self-records; any **one-shot** call (anything using `runPrompt`) must call
  `recordOneShotSession(repoRoot, agent, result, { sessionType, taskId })`
  from `src/server/agents.ts` immediately after the await. Several callers
  silently discarded their `PromptResult` before this rule existed, making the
  Tokens tab under-report — a task would show its Engineer and Reviewer but not
  the PM that authored it. Pick a `sessionType` that keeps the by-role
  breakdown legible (`dispatch` for auto-engineering, not `pm`).
- **Don't widen the formatter's scope.** `.oxfmtrc.json`'s `ignorePatterns` are
  deliberate, not an oversight: `**/*.md` keeps the formatter away from
  `work/*.md` task files (which must never be rewritten outside the RepoOS
  API), and `**/*.json` stops it reordering `package.json` keys and rewriting
  Xcode asset catalogs. `bun run fmt` is otherwise safe to run on a change.
- **Every user-facing `repoos.toml` feature setting needs a Settings UI control.** When adding a
  configuration key that enables, disables, or materially changes a user-visible feature, add it
  to `getConfigSchema()` and the appropriate Settings tab in the same change, with clear copy and
  a test. Reserve raw-TOML-only settings for advanced/internal configuration where a dedicated UI
  would be misleading or unsafe; document that deliberate exception.
- **Direct commits to `main` must pass format and lint, and a hook enforces it.**
  Close-out runs the full gate before anything merges, but a hand commit
  straight to `main` skips it. On 2026-09-18 one such commit left a stray blank
  line in `style.css`, and every close-out after it failed `oxfmt --check` and
  was misreported as "machine load" (#0423, #0425). `.githooks/pre-commit`
  (installed by `bun install` via the `prepare` script, which sets
  `core.hooksPath`) now checks staged source files with oxfmt/oxlint on `main`.
  It skips task branches, merge commits and `*.md` bookkeeping, so it never
  blocks RepoOS's own commits. **Never bypass it with `--no-verify`**. If it
  fires, run `bun run fmt`, re-stage and commit again. If `git config
  core.hooksPath` is empty in your checkout, run `bun install`. For anything
  beyond formatting, still run `repoos check` before committing to `main`.
  **The hook skipping task branches means formatting is not enforced at commit
  time there — the close-out gate is the first check.** Always run `bun run fmt`
  (or `repoos check --fix`) before committing on a task branch, just as you
  would on `main`; handoff also auto-formats and commits the result (#0651), but
  commit it yourself so the branch is clean before the gate runs.
  Incident: 2026-09-19, task #0435 — a hand-edit shortened two footnote strings;
  the formatter collapsed the now-short elements to one line, the hook didn't
  fire, and MTD failed twice on `oxfmt --check` before the formatting commit was
  added.
- **Small fixes: bundle them as easter eggs, don't hotfix.** Never commit to
  `main` on your own initiative (the direct-to-`main` caveat above). When a run
  turns up several small, independent, low-risk fixes — cosmetic, copy,
  test-race hardening, tiny UI or data-source corrections, docs follow-ups —
  collect them into ONE task titled `Easter eggs bundle: <themes>` instead of
  filing one task each or committing each straight to `main`. A bundle pays the
  per-task overhead — one worktree, one `repoos check` run, one review, one
  close-out and its server reload — once instead of once per item. The bundle
  body lists every item with its source task id, a one-line fix and one test per
  item; commit per item so a reviewer can read them separately; and mark each
  source task superseded when the bundle lands. Never fold easter eggs INTO a
  release-critical or machinery task — a failing small item would hold up the
  big one. Keep a bundle to about 3–6 items in one area family, file it p2/p3,
  and run it while big tasks soak or wait. A bundle is an ordinary task: it still
  runs the gate and goes to review — it just pays that overhead once for several
  fixes. When the human explicitly asks for a hotfix on `main`, the direct-commit
  exception above still applies. See `docs/easter-eggs-bundles.md`; #0721 is the
  worked example.
- **Explicitly authorized manual recovery only:** if the human directs you to
  hand-land a stale branch outside the normal pipeline, check other tasks' files —
  `git diff main...HEAD --name-only | grep -E '^(work|inputs|stories)/'` — and
  `git checkout main -- <them>` before merging. Anything but the task's own
  file is drift that will pollute another task's record. Background:
  `docs/close-out-pipeline.md`.

## Conventions

- **Dropdowns:** Use the custom styled dropdown component for every new
  dropdown in the UI. Never use default, unstyled `<select>` elements.
- **Confirmations and tooltips:** Never use native browser `alert()`,
  `confirm()`, or `prompt()` for app actions. Use the shared, designed dialog
  components in `src/ui-app/src/components/ui/dialog/` and the existing modal
  styles. Never add a native `title` tooltip for new UI explanations; use a
  styled tooltip or popover that matches the app, supports keyboard focus, and
  remains usable on touch screens.
- **Areas are comma-separated, never `+`.** A task's `area` is a per-repo
  vocabulary (`[[areas]]` in repoos.toml merged with every
  `[[preview.targets]]` area), and one task may carry several: write
  `area: web` or `area: [web, core]`, i.e. `repoos new/update --area web,core`.
  The legacy `server + ui-app` spelling parses only so old files read until
  the one-time migration in the server rewrites them (#0583); nothing new may
  produce it. Agents picking an area for a task should pick from the
  vocabulary when one exists and say so when none fits.
- **Drawer / panel forms:** New creation drawers (New task, New story, New
  input, and future panels) must use the shared dialog components
  (`ui/dialog/*`, body-teleported) and the global form classes in
  `src/ui-app/src/style.css` — `field`, `btn-row`, `ff-textarea`,
  `ff-done`, `shot-dropzone`, `ff-notice`, `ff-error`, and related `ff-*`
  helpers — instead of bespoke colors, borders, or spacing in a component's
  `<style scoped>` block. Extend `style.css` when a variant is missing.
- **Pages use the full main width.** Standard nav views (board, tasks,
  checks, settings, …) span the whole `.main` pane — no page-level
  `max-width` or centering margin on a view's root. Narrow/centered layouts
  are for deliberate exceptions (login/auth, modals); keeping a readable
  line length on inner prose (`max-width: NNch` on one paragraph) is fine.
  See the `.main` comment in `src/ui-app/src/style.css` (#0602).
- **Table-like label/value rows use aligned columns.** Any UI that renders
  repeated rows of labeled fields (a `dl` of `dt`/`dd`, or label+value pairs
  — no literal `<table>` required) must use an aligned two-column layout:
  labels share one fixed-width column, values align in the second, row
  spacing is consistent row to row, and multi-value content wraps inside the
  value cell — never under the label. Use the shared `.kv-rows` utility in
  `src/ui-app/src/style.css` (plus `.kv-wrap` on multi-value cells) when the
  same layout appears more than once, tuning `--kv-label-w` per surface;
  keep component specifics in scoped styles on top (#0623).
- **Runtime: Bun. Node is only the fallback for machines without Bun.**
  Every `repoos` command re-execs under Bun when it's installed, `bunfig.toml`
  (`[run] bun = true`) runs `package.json` scripts and the Node-shebang tools
  they call on Bun, and the install launcher execs Bun directly. When you add
  or change anything that runs code:
  - `bun <file>`, `bun run <script>`, `bunx <tool>`, `bun -e` / `bun -p`.
    Not `node <file>`, `npm run`, `npx`, `node -e`.
  - New scripts get `#!/usr/bin/env bun`.
  - Spawning a subprocess: `process.execPath` (inherits the current runtime)
    or `bun`. Fall back to `npm`/`node` only when Bun can't be launched
    (ENOENT/EACCES), never merely because a Bun run failed; a failed build
    is the real result.
  - Keep Node only where Bun genuinely may be absent, and say why in a
    comment: the CLI entry shebang (npm installs), the launcher's fallback
    branch, `scripts/run-tests.mjs` (runs under `npm test`, then re-execs onto
    Bun), `REPOOS_RUNTIME=node` / `just test-node`, and test fakebins that
    imitate third-party CLIs.
  - If Bun ever produces different output from Node for a tool, measure it
    and write the finding into `docs/architecture.md` before choosing Node.
    Vite's UI bundle, for example, differs cosmetically and was verified
    equivalent.
  Background: `docs/architecture.md` (Runtime).
- Tests: `bun run test` (vitest), never bare `bun test`. Bun's own test runner
  will pick up the same `*.test.ts` files and mostly work, but its `vi` shim is
  missing pieces like `vi.stubGlobal`/`vi.unstubAllGlobals` — those tests then
  fail with `TypeError: vi.stubGlobal is not a function`, which looks like a
  real regression but is just the wrong runner.
  `bun run test` is `scripts/run-tests.mjs`: a two-pass wrapper that runs the
  bulk suite at the configured pool size, then the latency-sensitive suites
  (`boot-timing.test.ts`) alone at one worker — with `REPOOS_STRICT_TIMING=1` —
  so their absolute wall-clock ceilings aren't blown by pool contention.
  In `boot-timing.test.ts` only the **wall-clock** test skips without
  `REPOOS_STRICT_TIMING=1`, so a raw `bun run test:vitest` (single-pass) or an
  ad-hoc `vitest boot-timing` can't produce a spurious timing failure. Its
  sibling — the #0330 boot-ordering test — deliberately does *not* skip: it
  makes no wall-clock claim, so it runs everywhere. Run the file directly with
  `REPOOS_STRICT_TIMING=1 bunx vitest boot-timing` (`bunx`, not `npx` — this
  repo defaults to Bun everywhere; a bare `npx` on this machine resolves to a
  Node-based npx binary, which is fine for most single-file runs but defeats
  the point for a *latency*-sensitive suite like this one). Extra args
  (`--changed <ref>`) forward to both passes.
  Coverage is deliberately opt-in so routine checks do not pay its extra cost.
  Run `bun run test:coverage` weekly, before releases, or on demand; it runs the
  full wrapped suite with V8 coverage and enforces the baseline thresholds in
  `src/ui-app/vite.config.ts`. Changed-path runs skip coverage because a partial
  report would be misleading. Text summary and HTML/JSON reports go under the
  ignored `coverage/` directory. The initial global floors are a measured
  baseline, not a quality target; ratchet them upward as critical paths gain
  behavior-focused tests.
- Language: TypeScript, NodeNext modules — imports use `.js` extensions even
  for `.ts` source (this is correct, not a bug).
- Build: `bun run build` (runs `tsc` then copies UI assets into `dist/ui/`).
  Staleness-aware by default (#0377): it skips when `src/` is unchanged since the
  last build (~0.1s vs ~5s), so a no-op build is cheap. Force a rebuild with
  `--force` or `REPOOS_FORCE_BUILD=1`; the raw pipeline is `bun run build:raw`.
- Source layout: `src/core` (engine), `src/server` (HTTP + SSE), `src/cli` +
  `src/commands` (CLI), `src/ui-app` (the Vite + Vue 3 SFC web UI).
- UI sitemap: routes are declared in `src/ui-app/src/router.ts` (path → view),
  each view is one `src/ui-app/src/views/*View.vue`, and the left-nav order +
  which links show is in `src/ui-app/src/nav.ts` (some entries are conditional,
  e.g. Releases only appears when a release provider is configured). Context
  (`/repo`, `ContextView.vue`) has Docs, Skills, Discover, and History tabs;
  commit diffs reuse `DiffView.vue` at `/repo/commits/:sha`. To find the
  code behind a screen, grep `router.ts` for the path or `views/` for the name.
  Dialog/modal content is body-teleported, so its CSS lives in
  `src/ui-app/src/style.css`, not the view's `<style scoped>` block.
- **Any `position: fixed` or fullscreen overlay added to a component MUST be wrapped in `<Teleport to="body">` (or use a Radix `DialogPortal`, which does the same).** Without it, the overlay is trapped inside the drawer's stacking context and becomes unscrollable, unclickable, and unselectable. This applies even when the CSS looks correct — `position: fixed` does not escape `transform`/`will-change`/`overflow: hidden` ancestors.
- **A body-teleported floating layer MUST carry `data-overlay-layer` (#0575).** While any modal dialog is open, Radix puts `pointer-events: none` on `<body>`, so an unmarked layer is click-transparent: the click falls through to the side panel, its inline title editor, or a board card behind it — and the panel behind reads that click as "outside" and dismisses itself. The shared dialog content and scrim set the attribute for you (`components/ui/dialog/layer.ts` gives one id to both, so scrim-click-to-dismiss still works); a hand-rolled `<Teleport>` overlay (banner, confirm, search, toast, …) must set `data-overlay-layer="floating"` on its root. `style.css` turns the attribute into `pointer-events: auto`. Add it to the root *and* the scrim, never to a click-through decoration (a tooltip, a highlight outline).
- After ANY UI change, rebuild (`bun run build:ui` for speed, or `bun run build`)
  so the worktree build is fresh. Do NOT automatically request a preview to
  verify it — previews are on request from the human, not something you spin up
  as a routine part of finishing a task (#0268).
- **`repoos shot` is the one sanctioned use of the managed preview by the
  engineer**, and only for a UI-visible change. But the engineer no longer has
  to remember to run it (#0594): at handoff the server captures declared
  `## Shots` itself (targets resolve like the CLI: changed paths, then area,
  then the default command), and without declarations it still captures one
  captioned `/` shot per target the diff's paths touch (test files are not
  UI evidence, #0603) — a tests-only or task-note diff records a visible
  `shots: skipped` instead, and a missing Playwright shows up as a visible
  `shots: skipped` note, never a failed handoff. The engineer's job
  is to DECLARE what a review should see — use
  `repoos update <id> --shots '<JSON list>'` to write a validated, fenced
  `## Shots` section (entries take `target`, `route`, optional
  `selector`, optional ordered `steps`
  (`click`/`fill`+`text`/`waitFor`/`waitMs`, plain CSS selectors), an
  optional `highlight` CSS selector outlining what changed, and a human
  `label` naming the change), usually 1–3 entries showing the changed
  screens. Every shot is captioned with why it exists (`declared: <label>` /
  `auto: matched <glob>`); a docs-wording-only diff captures nothing without
  a declared route (#0603). **Shot hygiene (#0613):** a declared `highlight` or
  `selector` that matches nothing records a visible warning; duplicates with
  the same target/route/steps/selector collapse to one capture. **Whole-window
  default (#0613):** declared shots capture the whole visible viewport
  (`fullPage: false`) with changed elements outlined via `highlight`;
  `selector` (element crop) is the exception, `fullPage` stays off. For tabbed
  views prefer `?tab=<id>` routes (e.g. `/agents?tab=detected`) over click
  steps. `--shots` accepts JSON without Markdown fences, validates every entry,
  and edits only that section. The older `--section Shots --section-body` form
  requires a fenced JSON list and rejects malformed content. A full `--body` replace that drops
  Problem / Desired UX / Acceptance criteria / Notes for AI is refused unless
  `--force` is passed. Manual `repoos shot` remains the tool for checking
  your own work; an engineer-made capture pre-empts the automatic one.
- **Previews are server-owned — never run `repoos serve` yourself.** RepoOS owns
  the control-plane port and every preview port. Preview requests are the
  human's to make: the human requests a preview manually from the UI when they
  want to see a change. The engineer agent does NOT auto-request one before
  handoff. If the human explicitly asks you to verify something the way a
  browser would see it, request this task's managed preview by emitting the
  exact signal line (idempotent — repeat requests return the same task preview,
  and no localhost/curl is needed):
  `::repoos-preview-request::`. RepoOS validates the request against your live
  run, starts the preview from your worktree, probes it server-side, and records
  the preview URL and probe result in your task transcript. Direct `repoos
  serve` attempts from agent processes are rejected; the preview is reaped when
  the task leaves active/review.
  **Previews are on-demand only, capped at ONE running at a time (#0271).**
  Nothing auto-launches a preview anymore — not on a task entering `review`,
  not at server boot for tasks already in review. Requesting yours may evict
  whatever preview was running for a different task (FIFO); that's expected,
  not a bug — if you need to re-verify something you checked earlier and the
  slot has since moved on, just emit the signal again.
  **This server-side probe is a plain HTTP request to the target's configured
  readiness path (`/` unless the target overrides it) — it does not open a
  browser and does not require login.** Auth
  being enabled is not a reason to skip verification or fall back to a
  component-level unit test instead: emitting the signal and reading the probe
  result from your transcript confirms the change serves, with no OTP involved.
  If a task genuinely needs deeper interactive verification — actually clicking
  through the logged-in UI, not just confirming it serves — log into the
  preview with the dev backdoor instead of a real email OTP you have no inbox
  for. See **Dev login** below for the exact email and code.
- The AGENTS.md *template* that `repoos init` scaffolds into other repos lives in
  `src/commands/init.ts` as a string literal. It is NOT this file. Editing it
  ships to every future `repoos init`, so change it deliberately and don't confuse
  it with this repo's own AGENTS.md.

## Dev login (skip the email OTP)

Local `repoos serve` and task previews run with auth **on** by default, but you
never need a real inbox to get past the login screen:

- **Email:** any allowlisted user. Use `hello@repoos.org` — the `bootstrapAdmin`
  in `repoos.toml`. The backdoor does **not** let you log in as an arbitrary
  address; the email must already be allowlisted.
- **Code:** the value of `REPOOS_AUTH_DEV_BACKDOOR_CODE`, set in the gitignored
  `.env` at the repo root — run `grep REPOOS_AUTH_DEV_BACKDOOR_CODE .env` to read
  it. If login fails, that file is the source of truth: the value may have
  changed, or `.env` may be missing entirely (`.env.example` shows the key with
  an empty placeholder). It is env-var only, never a `repoos.toml` key, and
  never honored when `NODE_ENV=production`.

This replaces only the OTP step; the resulting session is otherwise normal, and
the same code works against any locally-served instance (a task preview, or a
`repoos serve` a human is already running). Wiring: `src/core/config.ts` reads
the env var into `config.auth.devBackdoorCode`, and `src/server/routes/auth.ts`
accepts it in place of the OTP. Background: `docs/native-auth.md`.

Task-runner agents: for "does it serve?", still prefer the server-side probe
(`::repoos-preview-request::`, no login at all); reach for this dev login only
when the human explicitly wants the logged-in UI clicked through.

### Auth-less dev server (interactive sessions: skip login entirely)

Logging in on every session is annoying, and the backdoor puts a real session on
the human's server. `repoos.toml` already has a preview-only override
(`[preview.auth] enabled = false`, #0464); to get the same thing on demand:

```bash
just serve-noauth [port]      # default 7272; http://127.0.0.1:<port>, no login
```

It runs `REPOOS_PREVIEW_CHILD=1 bun dist/cli/index.js serve --preview-overrides
--port <port>` after a staleness-aware build. It binds 127.0.0.1 only, never
reaps the real server, and the real one on :7171 keeps requiring login. Stop it
with `pkill -f "serve --preview-overrides --port <port>"` when done. Use it for
browser-tool verification instead of the OTP backdoor.

**Run it from a task worktree or a scratch worktree — never from the checkout the
real `repoos serve` is serving.** Two servers on one root both watch the same
`work/` files, so a task entering `review` spawns *two* reviewers, and the second
server's watchdog (`runner.isRunning` is per-process) sees every active task as
dead and flags it. The recipe refuses when a non-preview server is already
serving the current directory. Check the directory first: a failed `cd` silently
leaves you in the main checkout, and the server then runs against it (this
happened on 2026-09-27, briefly, with no lasting effect). Confirm with the
server's startup log line (`root` and `mode: "preview"`).

## Debugging: search the error, then check the versions

When an error is *weird* — it makes no sense given the code, or the same code
behaves differently in two places — stop reasoning from first principles and do
two cheap things first:

1. **Search the exact error text on the web.** Someone has almost certainly hit
   it. This costs 30 seconds and routinely saves an hour of theorising.
2. **If anything smells like a dependency or environment problem, check the
   versions** — of the runtime, not just the packages. `node --version`,
   `bun --version`, and *which binary is actually running* (`process.execPath`,
   `which node`). "Works here, fails there" is a version difference until
   proven otherwise.

**Worked example (2026-08-15).** Task #0205's close-out failed the gate twice
with `TypeError: Cannot read properties of undefined (reading 'removeItem')` at
`src/ui-app/tests/repo-store.test.ts:805` — `localStorage` was undefined. The same suite
passed every time when run by hand. It was initially misdiagnosed as load-
induced flakiness (see `docs/dogfooding-vs-general.md`) and nearly written off
as contention noise from #0216, which would have been wrong.

A web search surfaced a known Vitest issue about Node's Web Storage API. Checking
versions closed it immediately:

- `bun run test` by hand → Node 24 → `localStorage` absent from `globalThis` →
  jsdom installs its own Storage → **passes**
- The close-out gate → `process.execPath` → the serving process's runtime,
  Homebrew Node 26 under launchd → Node defines `localStorage` as an accessor
  returning `undefined` (no `--localstorage-file`) → vitest's jsdom environment
  sees the key already present and skips installing jsdom's Storage → **fails**

100% deterministic, 668ms, on a completely idle machine. Not flaky at all. Fixed
with a setup shim (`src/ui-app/tests/setup/web-storage.ts`).

**Second worked example (2026-09-05).** `boot-timing.test.ts` (#0271) asserted
that `server.listen()` fires before the async index build finishes. A fix for
that test's HTTP-timing flake (comparing a network-polled timestamp against an
in-process one) checked out fine locally, then failed deterministically the
moment it ran through `bun run test` for real — not intermittently, every
single time. The cause wasn't the fix: `package.json`'s `"test"` script is
literally `node scripts/run-tests.mjs`, so a bare `bun run test` ran the whole
suite under **Node** unless the caller remembered `bun run --bun test` (what
`repoos check` uses internally, but nothing else did). Same command text, two
different runtimes. Under Bun — ~10x faster at spawning the git subprocesses
this fixture is full of — the async index build reliably finished before
`listen()` was even reached, flipping the exact invariant the test existed to
prove. Confirmed with a direct A/B on identical code: `bunx vitest run` 5/5
pass, `bun run --bun vitest run` 2/2 fail. Fixed by making
`scripts/run-tests.mjs` self-re-exec onto Bun whenever it's resolvable
(mirroring `reexecUnderBunIfRequested()` in `src/core/runtime.ts`), so
every invocation path now converges on one runtime — see `docs/architecture.md`.

**The sequel (#0330), and the general lesson underneath it.** Converging the
runtimes stopped the *symptom* but left the actual defect: the assertion was a
race, and which side won depended on how fast the box and the runtime were, so
the test measured the machine rather than RepoOS. The fix was to stop racing
rather than to keep the two runtimes honest — `startServer` now takes a
test-only `indexBuildGate`, awaited inside `LiveIndex.refreshAllAsync` after
the build finishes and immediately before its result is swapped in. A test can
hold the build at that point indefinitely, which makes "the listener bound
before the index was populated" a hard fact: the build provably got all the
way to the swap, the index provably has not been published, so if `listen()`
fired at all, it did not wait. **When a test's verdict flips with runtime
speed, the fix is usually to remove the race, not to reconcile the
environments** — a passing-under-Node suite that is meant to hold under Bun is
one machine-fingerprint away from shipping the bug it was written to catch.

**The general lesson:** "it passes for me but fails in the pipeline" is a
version/environment difference far more often than it is flakiness. Reproduce
under the *exact* runtime the failing system uses before concluding anything —
here that meant `/opt/homebrew/bin/node`, not whatever `node` resolves to in
your shell. And be suspicious of any diagnosis that requires the failure to be
random when it reproduces identically twice.

### Is a `repoos check` failure a flake or a real bug?

**If it reproduces in isolation on an idle machine, it is a real bug.** Genuine
resource-pressure flakes do not reproduce on a quiet box. Two corollaries, each
of which has cost days here:

- **Run the whole suite, not just the first failing file** — one root cause
  routinely breaks several suites, and the first failure is rarely the most
  informative.
- **Distrust exact-count assertions against streamed agent output**
  (`lines.length === 3`, `toEqual([...])`). A change to what a driver emits per
  turn breaks these, and it presents as a *timeout*, not an assertion error —
  which is exactly why one such regression was misdiagnosed as a flake for days
  while it broke every check.

There IS a real memory-pressure flake (subprocess-heavy tests timing out when
the machine is swapping), so this is a judgement call, not a dismissal. The
full triage order, the incidents behind it, and the remote-validation fix are
in `docs/debugging-check-failures.md` — read that before spending an afternoon
on a check failure you can't explain.

## Git setup: don't let a failed command skip branch creation

A past agent ran `git pull --ff-only && git checkout -b <branch>`. The pull
failed (no remote tracking branch), and `&&` short-circuited, so the branch was
never created and all work landed on `main`. Lessons:

- Do NOT chain git SETUP commands with `&&` such that one failure silently skips
  branch creation. Create the branch as its own step and confirm it succeeded.
- Do NOT `git pull` when branching from local `main` — there may be no tracking
  branch, and you don't need it. Branch from local: `git checkout main` then
  `git checkout -b <branch>`.
- Before your FIRST commit, verify you are on the intended branch
  (`git branch --show-current`). For normal task work, do not commit on `main`.
  An explicitly requested direct-to-main hotfix is the exception; confirm that
  authorization and stage only its intended files.
- Managed task worktree creation is RepoOS's job — use the Start action and
  do not hand-roll a second worktree for a task.

### Edit the task worktree, not the checkout your tools start in

A harness's file/edit tools and shell resolve relative paths against the
session's working directory — and for a task session that is usually still the
**main checkout**, even after RepoOS has demonstrably created and handed back
the task's worktree. Relative-path edits then land on `main` while the task
branch sits untouched, with no error. Two separate harnesses made this exact
mistake on 2026-10-01.

- Before your FIRST edit — not just your first commit — confirm where it will
  land: run `pwd` for shell work, and prefer the worktree's **absolute path**
  for every file/edit tool whose own working directory you don't control. A
  `cd` is not enough when the tool's root is fixed at the session's start.

## Stuck-active incident (#0151): worktree missing its own task file

A task can get permanently stuck `active`, failing finalization with
`task file is missing from the registered worktree`, retry included. Root
cause (confirmed via git history, not guessed): task creation writes the file
to disk and commits it to `main` (`docs(<id>): add task`), but that commit can
silently fail (`commitTaskFile` is fail-soft) while the file is still visible
everywhere else — API, UI, `repoos list`. If `/start` runs before a retried
commit lands, `ensureWorktree` cuts the branch from a `main` HEAD that doesn't
have the file yet. Once that worktree/branch exists, plain reuse never
re-checks freshness, so every future start/resume hands back the same
file-less worktree forever — a stuck task cannot self-recover.

Fixed in `ensureWorktree` (`src/core/git.ts`): whichever worktree it resolves
(new or reused) is now healed if the task's own file is missing from it — copy
main's current version in and commit it on the worktree's branch, narrowly
scoped to that one file so in-progress work is never touched. This should mean
you never see this failure mode again; if you do, that's a bug in the heal
itself, not something to work around by hand. **Do not "fix" a stuck task by
manually copying the file into the worktree** — that papers over the same
symptom without checking whether the healing logic ran or why it didn't; file
it as a bug against `ensureWorktree` instead, and use `git ls-tree
<worktree-branch> -- work/<file>.md` to confirm the file is genuinely absent
from history (not just stale) before concluding it's the same issue.

Related, softer version of the same gap: because `patchTaskFile` (status
transitions, e.g. `ready`→`active`) commits only to `main`, a worktree's own
copy of its task file can legitimately lag main's frontmatter (stale
`status`/`branch`/`updated_at`) even when the file itself is present — this is
expected, not a bug, and does not block review/done.
