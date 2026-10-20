# Review and close-out

A task with a feature branch reaches `done` through review. This page covers
the two halves of that: the **review process** — what happens while a task sits in `review` — and the
**close-out pipeline** that runs when you move it to `done`.

## Why an agent can't merge itself

When an agent finishes a task it hands it off and stops. It does not merge its
own branch, and it can't: the merge happens only when a human moves the task to
`done`. That's the whole design — agents do the work, and you review and decide
what merges.

## Getting a task into `review`

Moving a task to `review` is a **request**, not a status flip. RepoOS passes the commit guard and commits the branch, runs `repoos check`,
verifies that the tested tree stayed unchanged, and only then moves the task. Every route into `review` goes through that same finalization — the
**Review** button in the task drawer, dragging a card into the review column, a
`repoos mv <id> review` from a terminal, or an agent's own handoff. Nothing
reaches `review` on the commit guard alone.

Until it finishes, **the task stays in `active`** and the card reads *running
checks*. That is deliberate: the alternative is a task that claims to be ready
for review before anything verified it. If the check fails, the task stays
`active` with the reason shown, the work is untouched, and you can fix it and
ask again.

**Review** opens a small dialog:

- **Run checks** (default) — the full finalization described above.
- **Skip checks** — the commit guard only. It is recorded in the task's activity
  log as "review without checks", and **Move to done** still runs the full check
  before it merges, so this skips the early pass, not the gate. Use it when you
  already know the check is green and do not want to wait for it twice.

Dragging a card into the review column asks the same question. Agents never get
the skip option.

## The reviewer agent

If a reviewer is enabled on the [Agents](/agents) page, RepoOS runs it
automatically the moment a task lands in `review`. The reviewer reads the
branch's diff in the task's own worktree and writes a short report — bugs, edge
cases, suggestions — shown in the task drawer next to **Move to done**.

It's advisory. It changes nothing and never replaces your approval. Its verdict
is one of three lines:

- `` `good to go` `` — correct and complete.
- `` `needs some work` `` — close, but worth fixing first.
- `` `back to the drawing board` `` — off the mark.

A review run counts as complete only when the report includes one of those
verdicts. If the agent stops with partial output and no parseable verdict, the
run is marked **incomplete** (the partial report is kept for debugging), the
pass counter does not advance, and you can use **Review again** to retry.

### Auto-bounce: why a task can move back to `active`

The reviewer runs on **every** `review`, not just the first one. If new commits
land on the branch while the task sits in `review` — you pushed a fix, or an
agent did — RepoOS reviews the new head again. A verdict of anything other than
"good to go" **auto-bounces** the task back to `active`: the findings are sent
to the engineer session, which is expected to fix them and re-hand off to
review. The task's `review_rounds` counter goes up.

The one exception is a `needs some work` whose *only* stated blocker is stale
handoff evidence (the reviewer marks it `STALE-EVIDENCE-ONLY`): the change is
fine, only the captures are old, so bouncing the engineer would burn a turn on
nothing. That task **stays in `review`** — never bounced back to engineering.
**Auto-refresh stale review evidence once** is on by default (Settings → General).
RepoOS re-captures the evidence at the current HEAD and starts one new review
automatically, and a capture is attempted at most once per reviewed HEAD so a
stubborn stale marker cannot loop. With the setting off, or when the automatic
capture cannot run (a live engineer/reviewer, a dirty worktree, or a moved
HEAD), it simply waits: use **Refresh evidence** in the Changes tab (or
`repoos verify <id>`) to re-capture on the current HEAD, then **Review again**
in the UI or `repoos review again <id>`.

A second exception is **`EVIDENCE-GAP-ONLY`**: the code is acceptable but
handoff shots or verification are missing or unusable (not stale). The task stays
in `review`, automatic re-capture runs without counting a review round, and after
two failed repairs RepoOS flags **Handoff evidence still missing**
(`evidence-gap-exhausted`). See `docs/review-evidence-gaps.md`.

This is deliberate self-correction, not a failure. If you move a task to review
and then find it back in `active`, check its activity log — you'll see the
review round and the findings that caused it.

Auto-bounce is capped at **2 rounds** (`MAX_AUTO_REVIEW_ROUNDS`). Past that,
RepoOS stops and leaves the task for a human rather than looping forever. It
also stops early and escalates if the reviewer flags the task's own relevance —
an obsolete task needs a scoping decision, not more engineering.

### Automated verification: when RepoOS clamps a clean verdict

After the reviewer writes its report, RepoOS runs two **mechanical checks** and
appends a `## Automated verification` section to the report. If one fails, a
reviewer's `` `good to go` `` is **clamped to `needs some work`** and the task
auto-bounces with the reason. The activity log records why, and the message sent
to the engineer opens with a **Why this was sent back** line, so an agent that
cannot see the drawer still knows what to fix.

The two checks are:

- **Browser console errors** — only when the task's handoff browser evidence was
  required. Native/non-web work is skipped, not failed.
- **Guard negative-test evidence** — when a check *guard* was materially
  changed, a test must prove bad input is rejected, not only that valid input
  passes.

The guard check is **narrow on purpose** (#0762). It only looks at guards a
project actually declares — `[[check.steps]]` rows whose `kind` is a built-in
RepoOS guard (`theme-contrast`, `hardcoded-colors`, `bare-require`,
`task-assets`, `css-layers`, …) — plus RepoOS's own `src/commands/check.ts` in
this repo. Adding an *unrelated* `repoos.toml` block (`[release]`,
`[[distribution]]`, `[[shot.targets]]`, `[[preview.targets]]`, `[[agents]]`, …)
never counts, so it can no longer clamp a clean review by accident.

Two Settings (General tab, `[reviewVerification]` in `repoos.toml`) tune it for
projects whose tests are not JavaScript/TypeScript:

- **Guard negative-test review check** (`reviewVerification.guardTestCheck`,
  default on) — the kill switch. Turning it off skips the check entirely.
- **Guard test-file globs** (`reviewVerification.testGlobs`, default the JS/TS
  `*.test.ts`/`.tsx`/`.js`/`.mjs` globs) — set these so a Swift, Python or Go
  test can satisfy the check (e.g. `**/*Tests.swift`, `**/test_*.py`,
  `**/*_test.go`).

## Skill suggestions

This pass is deliberately conservative, and **off by default**. When enabled,
RepoOS analyses a task's session transcript only after the task has genuinely
reached `done` — never at `review`, when the outcome is not yet verified. A
reusable skill is a high bar: a stable procedure that helps on future, materially
different tasks, with real decisions/branches and evidence it saves repeated
investigation. One-off fixes, task-specific checklists, test ideas,
repository-local conventions, review feedback, and failed or unverified work are
rejected.

When a candidate clears that bar, the first occurrence is persisted internally
and creates nothing. A task titled `New Skill Suggestion: <procedure name>` with
a draft `SKILL.md` is created only once the candidate is corroborated by a
second independent completed session. A single session never creates a
suggestion; a named, stable external tool/API workflow is recorded as extra
evidence but does not substitute for corroboration. The draft states its
evidence — the source task IDs (and the named external workflow, when there is
one), the repeatable trigger, and why a test/instruction/task is insufficient.
It is a normal task in your inbox — **not** a live skill. Nothing goes live until
you read the draft, create `skills/<name>/SKILL.md` from it, and close the task.

- At most **one** suggestion task is created per procedure. Any other candidate
  procedures are listed inside that one task's body, never as separate tasks.
- The originating task's **Review** tab shows a one-line `Skill suggestion: #<id>`
  note linking to the created task.
- It is **off by default**. Turn it on under **Settings → Auto-suggest skills
  from completed sessions** (`skillSuggestions = true` in `repoos.toml`); off
  means no analysis, no suggestion tasks and no note.

The analysis runs on the same LLM infrastructure as the reviewer, and its token
spend appears in the task's Tokens tab like any other role.

## Approve and merge

When you're happy, move the task to `done` — from the board, the task drawer,
or `POST /api/tasks/:id/done`. That's what starts the close-out pipeline. Until
then the worktree stays open and nothing has merged.

This workflow is the same with or without a Git remote. A remote does not
require a GitHub pull request: RepoOS owns review and close-out unless you
explicitly choose a separate external workflow. `repoos mv <id> done` only
changes task metadata; it does not start close-out or merge code.

An explicitly authorized hotfix already committed on the primary branch is a
separate case. If it has a task record with no branch and is not in `review` or
already `done`, the same `/done` endpoint checks the primary checkout and
records release without a candidate merge. This is not a shortcut for an
unmerged feature branch; do not clear its branch metadata to use this path.

## Parking a task you're not ready to merge

A `review` task that has exhausted its review rounds, or that you simply do not
want to merge yet, does not have to stay in the Review column demanding
action. **Archive task** at the bottom of the task panel parks it without
merging, stopping, or deleting anything: the status stays `review` underneath,
the branch and worktree are kept, and the task moves to the **Archived** list
below the board. Add an optional reason, and unarchive it later to drop it
back into the Review column exactly where it left off. See
[Concepts → Archiving a task](/concepts) for the full behaviour: why archiving
is refused while a run, review, or close-out is live, and why a running
preview is stopped as part of archiving rather than refusing the archive.

## The Move-to-done pipeline

Close-out runs as a job with five phases. It works in a **separate candidate
worktree** (a sibling of your checkout, such as
`<parent>/<repo>-worktrees/repoos/integrate/<id>`, on branch
`repoos/integrate/<id>`), never in your primary checkout, so a failed close-out
can't leave your working tree dirty.

1. **queued → syncing** — first runs a cheap, non-destructive pre-check of
   whether the branch really conflicts with your primary branch; a real source conflict skips
   straight to the automatic repair below, without building a candidate. Otherwise
   it creates (or resets) the candidate worktree from the current primary branch.
   When the primary checkout already has `node_modules`, it reuses that directory by
   symlink rather than performing a cold install. If the candidate still has no
   usable `node_modules` (for example the primary checkout was never installed),
   close-out runs a frozen install in the candidate before the gate — unless the
   check plan's first full-profile step already installs dependencies.
2. **syncing → validating** — merges the task's feature branch into the
   candidate. RepoOS preserves the closing task's own bookkeeping file from the
   task branch; a source conflict is left for the repair flow below.
3. **validating** — re-checks the primary branch first: if it advanced since the candidate
   synced, the job discards the candidate and resyncs before validating. Then
   it builds and runs `repoos check`. A real check failure stays in the branch:
   fix it there and retry.
4. **publishing** — takes the repo lock, confirms the primary branch hasn't moved again,
   and fast-forward-or-merges the candidate into it. If it did move, it
   goes back to step 2 and self-heals.
5. **cleanup → done** — removes the candidate and the task's own worktree and
   branch, and marks the task `done`.

### Uncommitted files pause the close-out

Close-out only ever carries a branch's **commits**, so uncommitted changes are
never part of what it tested. Before starting, RepoOS checks both checkouts and,
if either has uncommitted files, stops with a dialog listing them:

- **Your primary checkout** — the merge would refuse to run over them.
- **The task's worktree** — the close-out would delete them along with the
  worktree. This is usually a fix applied after the last handoff commit (a
  reviewer's change, a late edit), and it has not been through any check.

**Commit & continue** commits them — in the worktree's case on the task branch,
through the same commit path a handoff uses, so the close-out's own build and
check then validate the result. **Cancel** changes nothing: the task stays in
`review` with every file exactly where it was.

**Engineer checkpoint after handoff (#0834):** if the only new commits on the
branch since handoff are automatic `WIP: engineer self-check checkpoint` commits
(from a scoped `repoos check` while the task sat in `review`), Move to done
starts **checkpoint recovery** instead of showing "Worktree changed after
handoff": the handoff gate runs again on the new HEAD, a delta-only review
covers just those commits, and close-out continues when that review is
`good to go`. While it runs the card shows **re-reviewing checkpoint…** so the
task never sits silently in review; a delta verdict that asks for changes bounces
the task back to `active` with the findings, and a gate failure leaves the usual
close-out error in place (retry Move to done, or send the task back to the
engineer). Any real source edit or a dirty tree still blocks with the usual
dialog (discard or send back to the engineer).

RepoOS never deletes a worktree that has uncommitted work on its own. If one is
left over (for example a close-out that raced a new edit), it is kept, named in
the task's `needs_input` detail, and reported by `repoos gc` until you deal with
it.

The same rule covers **Restart → Start clean**, the one place a worktree *is*
discarded on purpose: the confirmation lists the uncommitted files it is about
to throw away, so you can commit them first (or resume the worktree) instead of
discovering later that they were gone.

A **docs-only fast path** skips the build and check when the merged diff touches
nothing but documentation: every changed path under your configured docs directory,
or ending in `.md`. There is no "mostly docs" scoring; any other path runs the
full set of checks.

### Stopping a close-out

A close-out can get stuck — a flaky check, a test timeout, a runner that never
returns. While a task is in the pipeline, its task drawer shows **Stop MTD**
next to the disabled **Move to done**. Stopping cancels the in-flight job, tears
down the throwaway candidate, and leaves the task in `review` with its branch
untouched, so you can inspect what happened and click **Move to done** again.
Once the candidate has merged into your primary branch (the cleanup phase) it is
too late to stop — the job finishes on its own.

You no longer have to babysit a hung close-out, though: every attempt also has
an automatic wall-clock budget (`closeOut.timeoutMs`, **6 minutes** by default,
configurable in Settings → General → "Close-out timeout", `0` for no limit). A
close-out that runs past it is aborted the same way — candidate torn down,
branch untouched, task still in `review` — but unlike Stop MTD it is recorded
as a **retryable failure** with a `close-out timed out after …` reason and an
error card, so a pathologically slow run is visible instead of silently
disappearing. Retries and remote validation spend the same budget; see
[docs/close-out-pipeline.md](../docs/close-out-pipeline.md) for the details.

### Merge conflicts repair themselves

The first time two tasks are in flight at once, one of them may conflict with
the primary branch on a real source file. This is **expected behaviour, not a failure
state**:

- A conflict whose **only** path is the closing task's own bookkeeping file
  (`work/<id>-*.md`) is pure bookkeeping — RepoOS takes the primary branch's
  copy and continues, with no engineer round-trip and no feature review needed
  (#0754). This is why a stray status/activity-line conflict can never block a
  Move to done.
- A **narrow, provably-safe conflict** on a task that already passed review —
  both sides purely *adding* distinct lines at distinct places (the classic
  "two tasks each registered a new CLI command" shape), a lockfile, or
  generated output — is resolved by RepoOS **in an isolated candidate**
  against current main, without sending the work back through engineering or a
  full feature review. The pipeline shows **resolving integration conflict**;
  the original review stays tied to the commit it approved, only the resolution
  delta is reviewed, and the combined gate runs once on the resolved candidate
  before it publishes.
- A conflict on **anything else** (an edit rather than an append, files that
  overlap, a path RepoOS cannot classify confidently, or a task with no prior
  review) is non-retryable — retrying would derive the same conflict. RepoOS
  automatically hands off to an engineer session **in the feature branch's own
  worktree** to merge the primary branch into the branch and resolve it there.
  When that session finishes, close-out is re-enqueued and retries on its own.
  A conflict limited to the closing task's own bookkeeping file is the one
  exception: it needs no prior review, as described above.

The narrow path is deliberately conservative: staying inside a conflict hunk is
**not** treated as proof of semantic safety. If a resolution would change
behaviour, expand scope, or cannot be classified with confidence, it takes the
full engineering-and-review path instead.

So a task that appears to bounce between `active` and `review`, or re-runs its
engineer, is usually a conflict repairing itself. You don't have to click
anything; watch the activity log for the reason — a conflict resolved in the
candidate says so plainly, and never looks like failed development.

### Manual merges: same rule applies

When an agent manually merges `main` into a task branch (outside the close-out
pipeline), the same conflict-resolution rule applies: if git stops on a conflict
in `work/<id>-*.md`, take the primary branch's copy — it is pure bookkeeping.
See AGENTS.md, Rules section, for the exact `git checkout --theirs` steps, and
also the note about rebuilding after merge before running `repoos check`.

### Seeing the conflict, and keeping the error

To see exactly what conflicts, open the task's **Debug** tab and choose
**Merge conflict** (the error card's **View the conflicts** button jumps there).
It lists each conflicted file in the same expandable view as the **Changes** tab:
red lines are the primary branch's version, green lines are the task branch's.
It is computed live against the current primary branch without touching any
worktree, so it empties as soon as the conflict is resolved.

A failed Move to done stays on the card until the task is retried successfully
or you dismiss it with the **×** on the card. A page refresh no longer hides it.

Every close-out also reports its outcome to the top-bar **notice bell** — landed,
failed, or timed out — with the server's finish time, so you can see how a run
ended even if you closed the tab while it was working. See
[Notices and notifications](/notifications) for the bell and its per-type sound
and push toggles.

## Previewing a task's changes

You can preview the running app from a task's branch without merging it. Click
**Preview** on an `active` or `review` task and RepoOS starts a read-only
instance from the task's worktree at an OS-assigned port.

Previews are **server-owned and on demand**: nothing auto-launches one, and at
most **one preview runs at a time**. Requesting a new preview evicts whichever
one was running (FIFO). A preview stops on its own when the task leaves
`active`/`review`.

If your repo has [auth](/configuration#authentication) enabled, the preview
runs behind it like the rest of the server, so you'll hit a login screen even
locally — you don't need a real inbox, see the dev-login note in
[Troubleshooting](/troubleshooting#logging-into-a-local-preview). Auth is off
by default, so most repos skip straight to the running app.

For a UI-visible change, screenshots are captured **automatically** (#0594):
when a task moves to review and its diff touches any preview target's
`[[preview.targets]].paths` globs, the server runs the capture itself through
the managed preview — the engineer only writes a `## Shots` list into the task
body declaring which pages/states to shoot (see [`repoos shot`](/cli#repoos-shot),
especially if the interesting state is inside a drawer or modal that `/` does
not show; a `highlight` selector outlines what changed). The capture is
conservative by design (#0603): every shot is captioned with why it exists —
`declared: <label>` for a declared shot, `auto: matched <glob>` for the
rare fallback — test-only and task-note diffs capture nothing, and docs
targets need a declared route. So a `shots: skipped` note (tests-only or
docs-wording-only diff, missing Playwright, a preview that would not boot)
is information, not an error: it is recorded as a visible note in the task
log and activity, never a failed handoff. An engineer-made capture with
[`repoos shot`](/cli#repoos-shot) before handoff pre-empts the automatic one.

Shots can also be added and deleted by hand in the drawer's **UI changes**
sub-tab of the Changes tab (#0627) — no CLI needed — while the task is `active`
or in `review`:

- **Add shot** opens a plain-input modal (target dropdown, route, label,
  optional highlight/selector and steps — never raw JSON) that appends the
  entry to the task's `## Shots` list and captures it immediately, 5–30s, so
  the new image appears right in the list. A busy preview slot (one preview at
  a time) is a clear error, never a silent eviction of a preview you're
  viewing, and a route that fails to load leaves the declaration unwritten.
  Hand-added shots are stored as declared evidence, so the automatic pass
  still pre-empts (they count like engineer-made captures).
- **Delete** on a shot removes the image and its manifest entry — and, when a
  matching `## Shots` declaration exists, removes that entry too, so the next
  re-handoff cannot resurrect the deleted evidence. This works for automatic,
  declared, and legacy untagged shots alike. If several declarations could
  belong to an automatic or legacy shot, all of them are removed and you're
  told how many, so re-add any you still want.
**Shot hygiene (#0613, #0830):** a declared shot whose `highlight`, `selector`,
or step target is missing **blocks handoff** with a per-shot message; the
screenshot is still saved so you can see what went wrong. Auto-matched captures
record a miss as a warning only (#0743). Duplicate declarations with the same
target, route, steps, and selector collapse to one capture with merged
highlights. A capture that lands on a still-loading page (an `aria-busy` region,
or text like "Loading changes…") after its steps and settle blocks handoff for
declared shots the same way — a failed step, not a pass — so a placeholder
`click`/`waitFor` step that timed out and left the view loading cannot be
mistaken for real evidence (#0755). Tooltip and popover shots need a `hover` or
`click` step plus a `state` fixture.
**Stale captures (#0755):** each handoff capture stores the tree it ran on, and
the Changes tab compares that to the branch HEAD the review will use. When they
differ — a fix landed after the capture — the UI changes sub-tab shows a
**Stale capture** alert and the shot reads `check`, never `matches`; re-run the
handoff capture on the final tree. For a task already in review, use **Refresh
evidence** in the Changes tab or run `repoos verify <id>`. RepoOS refreshes the
shots and verification record against the current branch HEAD without an
engineer turn. The worktree must be clean, and the action is refused while an
agent or close-out is running.
**Bookkeeping-only commits do not stale a capture (#0766, #0861):** freshness
compares the captured commit with the reviewed HEAD. A diff containing only
configured task, input, story, schedule, reminder, RepoOS cache, or attachment
paths is still current; the reviewer is told that only bookkeeping changed.
Any other path (source, tests, docs, config, package files) makes the capture
stale. Git errors or unknown commits fail closed as stale. Shot reuse,
automatic refresh, `repoos verify`, and the Changes tab use this same check.
**Whole-window default (#0613):** declared shots capture the whole
visible viewport (`fullPage: false`) with changed elements outlined via
`highlight`; `selector` (element crop) is the exception, and `fullPage` stays
off. For tabbed views, prefer `?tab=<id>` routes (e.g. `/agents?tab=detected`)
over click steps to reach the right tab; a task drawer is reached the same way —
`/work?task=<id>&tab=changes` opens that task's drawer on the Changes tab (#0755)
— and always `highlight` the changed
elements. The PNGs are stored gitignored under `work/.attachments/<taskId>/shots/`
(the default local attachment storage; cloud storage is opt-in, see
[Attachment storage](/configuration#attachment-storage)) and appear as the
**UI changes** sub-tab of the task drawer's Changes tab, so you
see what actually rendered rather than only the diff. The Changes tab splits
**UI changes** and **Code changes** into sub-tabs (#0773): **UI changes** is
selected by default when the task has shots, **Code changes** otherwise. `repoos shot` picks its
target from the task's changed files (`[[preview.targets]].paths`, plus the
default target's own `[preview] paths` for app diffs; test files are not UI
evidence), and the drawer warns if the task's `area` disagrees — pick the
right target from the preview dropdown if so.
