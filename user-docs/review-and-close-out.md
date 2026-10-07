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

This is deliberate self-correction, not a failure. If you move a task to review
and then find it back in `active`, check its activity log — you'll see the
review round and the findings that caused it.

Auto-bounce is capped at **2 rounds** (`MAX_AUTO_REVIEW_ROUNDS`). Past that,
RepoOS stops and leaves the task for a human rather than looping forever. It
also stops early and escalates if the reviewer flags the task's own relevance —
an obsolete task needs a scoping decision, not more engineering.

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
[Concepts → Archiving a task](/concepts) for the full behaviour, including why
archiving is refused while a run, review, preview, or close-out is live.

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

- A conflict on the closing task's own bookkeeping file is resolved from that
  task branch.
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

The narrow path is deliberately conservative: staying inside a conflict hunk is
**not** treated as proof of semantic safety. If a resolution would change
behaviour, expand scope, or cannot be classified with confidence, it takes the
full engineering-and-review path instead.

So a task that appears to bounce between `active` and `review`, or re-runs its
engineer, is usually a conflict repairing itself. You don't have to click
anything; watch the activity log for the reason — a conflict resolved in the
candidate says so plainly, and never looks like failed development.

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
section (#0627) — no CLI needed — while the task is `active` or in `review`:

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
**Shot hygiene (#0613):** a declared `highlight` or `selector` that matches
nothing at capture time records a visible warning (for example: highlight `.x` matched
nothing on /route) — capture still succeeds. Duplicate declarations with the
same target, route, steps, and selector collapse to one capture with merged
highlights. **Whole-window default (#0613):** declared shots capture the whole
visible viewport (`fullPage: false`) with changed elements outlined via
`highlight`; `selector` (element crop) is the exception, and `fullPage` stays
off. For tabbed views, prefer `?tab=<id>` routes (e.g. `/agents?tab=detected`)
over click steps to reach the right tab, and always `highlight` the changed
elements. The PNGs are stored gitignored under `work/.attachments/<taskId>/shots/`
(the default local attachment storage; cloud storage is opt-in, see
[Attachment storage](/configuration#attachment-storage)) and appear as the
**UI changes** section of the task drawer's Changes tab, so you
see what actually rendered rather than only the diff. `repoos shot` picks its
target from the task's changed files (`[[preview.targets]].paths`, plus the
default target's own `[preview] paths` for app diffs; test files are not UI
evidence), and the drawer warns if the task's `area` disagrees — pick the
right target from the preview dropdown if so.
