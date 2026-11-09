# Agent workflow rules — full text

Long-form versions of the rules that `AGENTS.md` summarises. `AGENTS.md` is
kept under 30 KB on purpose (Codex truncates project docs at 32 KiB by default,
Claude Code warns near 40k characters, Muse Code truncates at 64 KiB — see
`docs/agents-md-size.md`), so the detail, history and incident write-ups live
here. Each section is the original text, moved verbatim on 2026-11-05.

## Human-gated work (never close out as if the human part were done)

**Never close out human-gated work as if the human part were done.** A task
carrying `needs_input_reason: needs-human-step` has acceptance criteria that
need a real device, account, credentials or third-party sign-up. Before
`repoos done <id>` (or Move to done): confirm the scope being landed needs no
human (the tests use fakes and nothing depends on that human step); if a
criterion does, file that part first —
`repoos new "<title>" --depends-on <id>`, then
`repoos update <new> --assigned-to human` (`repoos new` defaults to
`assigned_to: ai`, so the reassignment is required), or use `repoos split <id>`
when the task already tags mixed `[human]` / `[ai]` criteria — narrow the original task
to the agent-doable scope, and only then close out. If the human part cannot be
separated from the code, do not close out; report it to the human. Applies to
interactive sessions and the CTO/driver path alike. Incident: #0660 was closed
out while it carried the flag (2026-10-14) and the human-only verification was
split out afterwards, as #0784 — the wrong order.

## Holds

**A `hold` makes a task inert for ALL automation** — `repoos hold <id> --reason
"…" [--until <date>]` stops any running engineer and parks the task out of
auto-dispatch, the CTO monitor (idle nudges and stalled-agent restarts), the
watchdog's auto-resume, crash recovery, and queued-message delivery. It is
broader than `pause`, which only stops the current run. A held task keeps its
`status` and is never started by anything but an explicit human/driver command:
`repoos start <id> --force` (the escape hatch) or `repoos unhold <id> [--start]`
(which clears the hold and may re-launch). The hold is written into the task's
frontmatter (`hold`, `hold_reason`, `hold_until`, `hold_by`, `hold_at`) and is
visible on the board and in `repoos driver brief`'s **Held** section; held tasks
do not count toward `maxActiveTasks`. A `hold` tag is equivalent to the `hold`
flag. Every automation that might start an engineer consults `isHoldActive`
(`src/core/task-selection.ts`) before doing so, and that predicate is the single
chokepoint (`relaunchEngineerOnActiveTask`).

## Integration conflicts: narrow resolution vs full cycle

### Integration conflicts: narrow resolution vs full cycle

When another task lands first and a task that already passed review now
conflicts with `main`, the close-out tries a **narrow resolution** before
restarting anything (#0692, `src/server/conflict-resolution.ts`): if the
conflict is *provably safe* — both sides purely add distinct lines at distinct
places, generated output, a lockfile, or the task's own bookkeeping file — and
the task has a prior successful review, RepoOS resolves it in an isolated
candidate against current main, reviews only the resolution delta, runs the
combined gate once on the resolved tree, and resumes the authorized Move to
done. The original review stays tied to the commit it approved. A conflict whose
**only** path is the task's own `work/<id>-*.md` is the one exception to the
prior-review rule (#0754): it is pure bookkeeping, resolved by taking main's
copy, and needs no feature review.

Eligibility is **semantic, never path-based, and fails closed**: an edit rather
than an append, overlapping hunks, an unclassifiable path, or no prior review
takes the full engineering/review handback — staying inside a conflict hunk is
not proof of semantic safety. Never widen the allowlist in
`conflict-resolution.ts` without a test proving the new class is
behavior-preserving, and never auto-resolve a conflict on a task with no prior
review (the task-file-only case aside). A resolution candidate whose tree is not
the one its combined gate validated must not publish.

## Interactive sessions: not editing a task in review / close-out

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
  a main sync bringing in other tasks' task files — #0600), a conflict-free
  merge of main into the branch that is exactly what git computes on its
  own (the committed tree equals a `merge-tree` replay of the merge's parents; hand
  resolutions or edits slipped into the merge still fail — #0624), or **only**
  engineer self-check WIP checkpoint commit(s) on that task while the tree stays
  clean (#0834 — Move to done re-runs the handoff gate and a delta review, then
  resumes close-out; a failed delta review bounces to `active` like any other
  review finding). Real source edits still block close-out. Incident: 2026-09-30, #0594 — four files edited
  mid-close-out never landed.

## Direct-to-main details: the repoos.toml close-out exception

**Exception: Move to done blocked by `repoos.toml` (human-authorized
2026-10-18).** Automatic quota and usage pauses are not this case: they live in
the gitignored `.repoos/budget-runtime.json` (#0998) and do not dirty
`repoos.toml`. A leftover `repoos.toml` diff that is only those automatic
pause fields is ignored by the dirty-main check and is not checkpoint-committed.
`repoos done <id>` refuses with "main has N uncommitted file(s)
blocking close-out" when the human's settings edit is the only dirty file on
main (the human picks a setting in the UI; it stays uncommitted). In that case,
and only then, a driver may commit `repoos.toml` on main itself, with its
current contents and the message `chore: checkpoint before close-out (#<id>)`,
then retry `repoos done <id>`. Preconditions: the only dirty path is
`repoos.toml` (never commit other files, other tasks' work, or an owner's WIP),
and you stage that one path explicitly (`git add repoos.toml`). Do not edit,
revert or stash its contents, and do not use `--no-verify`. Say in your report
that you committed it. RepoOS's own close-out already does this checkpoint
commit in some paths (#0820), so first check `git status --short`: if it is
already clean, just retry. Background: #0831 sat blocked for a nap-length
window on 2026-10-18 because drivers were told never to touch this file.

## Historical caution (2026-09-16)

**Historical caution (2026-09-16):** external CLI status writes raced a live
reviewer, which later reverted a task from `done` to `review`. The old advice
to avoid that race by skipping review or reissuing `mv done` is not the current
workflow. The lesson is to coordinate through server actions, wait for actual
completion, and keep merging and status changes in the close-out pipeline.

## Definition of done: the check plan in detail

## Definition of done

Before a task moves to review, `repoos check` must pass. It runs the check plan
this repo declares in `repoos.toml` (`[[check.steps]]`, #0446) — for RepoOS
that is:
- Build staleness check (`src/` vs `dist/`); a stale build is rebuilt automatically (`bun run build`) and fails only if that build fails
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
Close-out runs the full profile with changed-path tests plus always-run safety
suites by default; release runs every test. A scoped `repoos check --changed main` (or
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

## Docs staleness: inline vs periodic

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

## Self-hosted repo details

## This repo is self-hosted — read this before running anything

RepoOS manages its own roadmap. This means a few things are true that you
cannot tell from the code alone:

- The `repoos` command is very likely a `bun link` dev build pointing at THIS
  repo's `dist/`. It runs compiled JS, not the TypeScript source. On startup,
  it compares a hash of `src/` with `dist/.build-info.json`. When a marked
  build is stale, it runs `bun run build` and re-execs the same command so the
  command uses fresh compiled code. This applies to `repoos check` and `serve`
  too. Concurrent CLIs share that build through `dist/.repoos-build.lock`:
  later callers wait for the one already running instead of starting another
  `tsc` + Vite. The re-exec is attempted once; a failed build or still-stale marker
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

## Rules in full

- **Merging main into a task branch: take main's copy of work/<id>-*.md.** When manually merging main into an active task branch, git may stop on a conflict in `work/<id>-*.md` (the task file is pure bookkeeping, always superseded by main's version). Take main's copy: `git checkout --theirs work/<id>-*.md`, then stage and commit. Do not pause the merge to report this. RepoOS auto-resolves these inside close-out (#0754); manual merges need the same rule.
- **A task's reports are its own bookkeeping.** Engineering rounds and review passes live together under `work/reports/<id>/` (`round-<n>.json`, `review-<n>.md`; see `user-docs/engineering-reports.md`). They are committed with the task, and handoff/landable/close-out treat this task's report files as bookkeeping rather than implementation drift — another task's reports still fail the task-scope check. Never hand-edit or delete a stored round or pass.
- **Check gate bookkeeping (#1061).** While a handoff or in-flight check runs, `work/**` and `.repoos/**` commits on the task branch are deferred (not invalidating), RepoOS refuses new engineer turns and source commits, and source changes that bypass those controls are detected by post-check drift inspection. Already-running engineers can still write files directly; this cannot be reliably prevented. See `user-docs/check.md` § "Bookkeeping during a running gate".

- **A task branch's diff contains ONLY that task's own files (#1076).** Another
  task's `work/<other-id>-*.md` file and `work/reports/<other-id>/**` must never
  appear in a task branch's commits — the landing preflight rejects the branch
  ("the diff changes another task's bookkeeping"), and an engineer then has to
  restore them by hand, round after round. The rule and the code paths:
  - **Where siblings leak in.** The server does NOT deliberately write a
    sibling's file into a worktree. An audit of the write sites that can target a
    worktree — `patchTaskFile` callers (`routes/tasks.ts` `:1194`,
    `server.ts` `:3432` in `syncTaskBranch`) each write only THIS task's own file
    (`task.path`) into its worktree, never a sibling's; activity, CTO notes and
    watchdog writes go to `config.root`/main. Siblings arrive indirectly: the
    engineer's self-check WIP checkpoint
    (`commitWipCheckpointForRemoteGate`, `src/server/engineer-remote-self-check.ts`)
    used to run a bare `git commit`, which folds WHATEVER is staged — including a
    sibling file a board write left dirty-and-staged — into the branch; a
    `git add -A` sweep in the worktree (`review-guard.ts`) can do the same; and a
    merge of main into the branch can carry a sibling's newer copy. It then
    compounds: the WIP loop re-commits it every check.
  - **The guardrails.** The WIP checkpoint commits only the paths it intended
    (`git commit -- <paths>`) and resets any foreign bookkeeping first.
    `guardReviewTransition` unstages foreign `work/` files before its implement
    commit. Handoff, after that commit gate and before the review lock, runs
    `restoreForeignTaskBookkeepingFromMain` (`src/core/git.ts`): it makes main's
    copy authoritative for every foreign file the branch touched — modified or
    deleted files get main's version back, branch-added siblings are removed —
    and lands the restore as one plain bookkeeping commit the review tolerates.
    It reports what it restored in the task log; it never fails a handoff.
    A commit made WHILE a merge is in progress (`lockfile-conflict.ts`,
    `integration-orchestrator.ts`'s narrow resolution, `done.ts`'s drop-`dist`)
    cannot use a pathspec — git refuses (`cannot do a partial commit during a
    merge`) — so those keep a bare `git commit` and instead scope the preceding
    `git add` to their own paths; do not "fix" them into a partial commit.
  - **What an engineer sees.** `repoos landable` and the handoff report name the
    offending files and the cause in plain English ("the diff changes another
    task's bookkeeping: work/<id>-*.md"), with the fix spelled out. An engineer
    should never need to run `git checkout main -- <file>` by hand.

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

- **Resource pressure: use RepoOS's `pressureGuard`, not your own thresholds
  (#0940).** RepoOS's configured `pressureGuard` is the only decision point for
  whether resource pressure should block engineer starts, local checks, browser
  steps, or remote runner dispatch. It uses the limits in Settings (load per
  CPU, reclaimable memory, paging activity, macOS `memory_pressure -Q` free
  percentage and warn/critical level, Linux PSI, and the related rates in
  `user-docs/configuration.md`) — see `docs/memory-pressure-guard.md`. Read
  RepoOS's verdict from `repoos stats`, the dashboard pressure banner,
  `repoos driver brief`, or a task's queue marker (`reason: pressure` and the
  hold message). **Never** block or defer starts with self-chosen numeric
  limits (for example a minimum "free swap" in GB or a memory-pressure free %
  you picked), and never work around a guard hold by starting anyway under a
  different threshold. On macOS, `vm.swapusage` "free" is unused swap-file
  capacity, not a pressure signal; the OS may retain swap during normal
  operation, so swap used or free swap alone does not prove thrashing. Swap-used
  ratio stays advisory. Blocking signals are paging activity, reclaimable
  memory, macOS `memory_pressure` critical, compressor bytes above
  `pressureGuard.maxCompressorBytes` (default 8 GiB; only where no macOS
  pressure level is available — on macOS a big compressor pool is normal and
  advisory), load above `pressureGuard.maxLoadPerCpu` (default 3× per CPU), idle
  CPU below `pressureGuard.minIdleCpuPercent` (default 5%), and the other
  configured limits above. Heavy builds and tests across every checkout on the
  host share `heavySlots` (default 2, `~/.repoos/local-check-slots`) and
  engineer-launched Vitest/Playwright runs use the worker caps in Settings.
  When the guard
  holds a start, report RepoOS's reason to the human and wait (or help clear
  pressure). When `pressureGuard.enabled` is off or the limits look wrong for
  this machine, ask the human to change Settings — do not invent another gate.

- **Agent drivers pick from the budget allowlist.** When you (an AI session, not
  a human in the UI) set an engineer/reviewer override — `repoos override`, or a
  `PATCH` on `cliOverride`/`modelOverride` — the server refuses a pair outside
  the human-approved allowlist in `repoos.toml` (`[[budget.allowlist]]`) and
  refuses a **paused** pair the same way. Run `repoos override --help` to print
  the allowed agent + model pairs (paused ones are marked), or read them on the
  Agents page's **Budget Controls** tab. A paused entry stays configured:
  `repoos agents pause <agent> [--model <model>] [--until <date>] [--reason "…"]`
  stops starts/dispatch/failover/drivers from selecting it, and
  `repoos agents resume <agent> [--model <model>]` brings it back. A human in
  the UI keeps the full list, and an empty allowlist restricts nothing. Don't
  work around a refusal; ask a human to change the allowlist or resume the pair
  if you need another one.

- **Never `git add` binaries under `work/` or `inputs/`.** Task and input
  screenshot uploads land in `work/.attachments/` / `inputs/.attachments/`,
  which are gitignored and served by the running server from disk — the
  committed record is the `.md`, never the pixels. `repoos check`'s task-asset
  guard fails the gate on any tracked image/PDF under those two trees. Product
  image assets (UI, icons, logos, `docs/`) live elsewhere and stay tracked.
- **When you create or update a task from a request that came with images,
  attach every one of them** with `repoos new "<title>" --screenshot path.png`
  (repeat `--screenshot` per image) or `repoos update <id> --screenshot path.png`
  (`--caption "..."` labels a single image's alt text). The command stores each
  file under the gitignored `work/.attachments/<id>/` and writes the task's
  `## Screenshots` section itself — never `git add` the pixels, never hand-copy
  into `.attachments/`, never edit the section by hand. Say in your reply which
  images you attached (the command prints their URLs). Dropping the human's
  screenshots makes the engineer and reviewer guess at the visual problem, so
  an image attached to the request is an image that lands on the task (#0763).
- **Features that take an API key** must follow `docs/api-keys.md`: register the
  provider in `MODEL_PROVIDERS` with a fixed `envVar`, save only through
  `setDotEnvSecret` / `POST /api/model-providers/:id/key`, never write keys or
  env-var names into `repoos.toml`, show masked save-on-Save UI with Saved /
  Not set status only, use fake values in tests, and never paste live keys into
  tasks, chat, or config fields (incident: #0803).
- **Keep project secrets separate from RepoOS credentials.** Project environment
  files are plaintext dotenv text, not an encrypted vault; the API and UI are
  write-only for values. Only explicitly bound local consumers receive granted
  keys, missing values never fall back to another environment, and deployment
  bindings never upload or publish values. Prefixes `VITE_`, `NEXT_PUBLIC_`,
  and `PUBLIC_` mean values may be embedded in client assets; visibility labels
  do not sandbox unrestricted local processes. Preserve this boundary in tests
  and explain it in `user-docs/environment-and-secrets.md`.
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
  filing one task each or committing each straight to `main`. Several
  bundles may be open at once (Nick, 2026-11-06). A new small fix goes into an
  open bundle that has not started yet (update its body and items); once a
  bundle is active (an engineer is on it) don't grow it — start another bundle. A bundle pays the
  per-task overhead — one worktree, one `repoos check` run, one review, one
  close-out and its server reload — once instead of once per item. The bundle
  body lists every item with its source task id, a one-line fix and one test per
  item; commit per item so a reviewer can read them separately; and mark each
  source task superseded when the bundle lands — an explicit note in the task
  body, leaving its `status:` as it is, never `repoos mv <id> done`. Never fold
  easter eggs INTO a release-critical or machinery task — a failing small item
  would hold up the big one. Keep a bundle to about 3–6 items, and they may mix
  areas (web, server, docs) as long as every item is small and independent; an
  open bundle already at that size is split, not grown. File it p2/p3, and run
  it while big tasks soak or wait. A bundle is an ordinary task: it still
  runs the gate and goes to review — it just pays that overhead once for several
  fixes. When the human explicitly asks for a hotfix on `main`, the direct-commit
  exception above still applies. See `docs/easter-eggs-bundles.md` for the full
  workflow and the fixed bundle body shape (`## Items` with stable E-ids,
  then one `## E<n> · Title` section per item with the usual four sub-headings);
  #0822 is the worked example.

- **Explicitly authorized manual recovery only:** if the human directs you to
  hand-land a stale branch outside the normal pipeline, check other tasks' files —
  `git diff main...HEAD --name-only | grep -E '^(work|inputs|stories)/'` — and
  `git checkout main -- <them>` before merging. Anything but the task's own
  file is drift that will pollute another task's record. Background:
  `docs/close-out-pipeline.md`.
