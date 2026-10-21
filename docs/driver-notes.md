# Driver notes — lessons from running the board

An append-only log for whoever is driving this board — the CTO, a human, or an
external agent session rotating in. Append a dated entry when you hit something
that would cost the next driver time; do not keep it in private memory
(see `AGENTS.md`, "Where project knowledge goes: the repo, not your harness").

Start a shift by reading `repoos driver brief` (or the UI's attention feed) and
this file. The brief is generated from live state; this file is the part that
cannot be — the judgement calls and the sharp edges.

## Format

```
## YYYY-MM-DD — <one-line summary>

What happened, what I did, and what RepoOS could do better — with the evidence
(task id, command, error text, numbers). Triage anything durable into a task.
```

## Entries

## 2026-10-07 — the brief replaces the hand-written handoff

Nine of the planks in the 2026-10-06/07 overnight run were routine, rule-shaped
work that a spec can carry: poll state, verify a green review, serialize merges,
restart dead engineers, retry hung close-outs, and write the handoff note. This
task (#0731, story #0009) turns the handoff note into `repoos driver brief`,
generated from live state, so a new driver starts from the board's actual
condition rather than a document that went stale before it was read.

Lesson worth keeping: a handoff doc is a *cache of live state*, and it is always
wrong by the time it is read. Generate it instead of writing it.

## 2026-10-20 — reviews, messages and handoffs race

On 2026-10-20, four tasks (#0843, #0854, #0860, #0861) took about 49 of that
day's 68 review passes. Three failure shapes repeated:

- **A queued message does not reach the engineer before its handoff.**
  `repoos message` is delivered only at a turn boundary. On #0854 pass 8 the
  review read work from before the fix message; on #0860 codex crashed after the
  message and a handoff was auto-requested on the unmerged branch. Send the
  message *before* starting an idle engineer, say "do not hand off until … and
  `repoos check` passes", and check `message_delivered` in the task file.
  `--now` interrupts the running turn and logs "agent exited with an error" —
  reserve it for an engineer that is stuck and unread.
- **Reviews chain on an unchanged tree.** #0861 passes 2–9 ran over ~45 minutes
  with no engineer working, all on the same finding, and `repoos message` was
  refused while each review ran. Until fixed by #0865, wait for the task to come
  back to `active` before messaging, and do not re-trigger `repoos review again`
  without reading the latest verdict.
- **Whack-a-mole.** #0843 went past 22 review passes, #0854 past 15 and #0861
  through 13, each finding one more instance of the same class. When messaging
  an engineer, send ONE complete list that names the class and asks for an
  audit plus table-driven tests, not the single instance. Until fixed by #0872,
  the reviewer prompt does not ask for the whole class by itself.

Stale evidence only ("STALE-EVIDENCE-ONLY") is cheaper than a fix: `repoos
verify <id>` then `repoos review again <id>`. #0861 (landed 2026-10-20) stops
`work/`-only commits from making evidence stale; read the verdict before
re-running anyway.

## 2026-10-20 — phantom runners and crashed engineers need different repairs

**Phantom runner.** `repoos start <id>` says "Task #<id> is already running"
while no process exists, and the task sits `active` with no commits or activity
for 10+ minutes. The watchdog and the CTO's `restart-stalled-agent` do nothing
because the runner table says the engineer is alive; `repoos pause` plus
`start --fresh` often still fails. Repair with `repoos mv <id> ready` then
`repoos start <id>`. Seen on #0843, #0854, #0860 and #0861. The CTO nudge
("completion reminder after 5m") does not mean the engineer is dead — check for
a live process or a long gate first. Until fixed by #0863.

**Crashed engineer.** "agent exited with an error (codex) · Reading additional
input from stdin" was followed by an automatic handoff request on an unfinished
branch, and the `needs_input` flag stayed stale after the engineer resumed. The
CTO only restarts the same agent and model. Clear the flag (`repoos update <id>
--needs-input false`), switch to an allowed pair (`repoos override <id> --cli
opencode --model opencode-go/deepseek-v4.1-flash`, after `repoos override
--help`), resend the FULL context (a fresh engineer has none), then `repoos
start <id>`. Until fixed by #0869.

## 2026-10-20 — run the landing pre-checks as their own step, not inside `repoos done`

#0860 had a "good to go" on a HEAD that still conflicted with main in
`src/core/types.ts`; the conflict only surfaced when `repoos done` refused. A
review can stay green on an unchanged commit while the branch never merged, so a
verdict is not a landing check. Check separately: the review lock sha equals the
worktree HEAD (a missing lock is only a warning), the worktree is clean, `git
merge-tree --write-tree main <branch>` conflicts only in this task's own
`work/<id>-*.md`, and the branch diff contains no `repoos.toml` and no other
tasks' files. `repoos mv <id> done` is not a landing path — see AGENTS.md,
"Review and sign-off". `repoos landable <id>` runs the same checklist read-only;
use it from the moment it is available. Until fixed by #0867.

## 2026-10-20 — the machine thrashes mostly on non-RepoOS processes

This 24 GB laptop hit load 90–500 with swap full and the memory compressor above
10 GB. Load average is inflated by threads waiting on swap, so it is a poor
signal on its own: `top -l 1 -n 0` (CPU idle %) and `sysctl vm.swapusage` say
more, and `ps -axo pid,etime,%cpu,rss,command | sort -k3 -rn | head` names the
consumers. On 2026-10-19/20 the top consumers were Chrome helpers at 80–120% CPU,
the Claude desktop app, WindowServer, and a second RepoOS project (LightingAI)
with three active engineers on the same machine. Quitting Chrome dropped load
from 92 to 3 once. Hold new starts above load ~15 and keep at most ~3 engineers
here; ask Nick to close other apps rather than restarting the server. Until
fixed by #0871 (memory-pressure guard with non-RepoOS attribution).

## 2026-10-20 — ask before deleting unknown untracked files on main

An untracked `repoos/.repoos/checks.db*` in the main checkout blocked two green
tasks for ~2 hours ("main has 3 uncommitted files") because no one was
authorized to delete it. It held four pre-review check runs whose worktree was a
LightingAI worktree — a cross-project cache write, not RepoOS's own state. Ask
once, early, with the evidence (path, what wrote it, which tasks are blocked),
then act on the answer. Never delete or commit a file on main on a guess. Until
fixed by #0870 (check-store root and nested `.repoos/` gitignore).

## 2026-10-20 — a declared shot on the wrong target burns review rounds

#0860's Settings shot resolved to the Docs site target and failed with
"'text/html' is not a valid JavaScript MIME type"; #0861's `drawer:shotEvidence`
shot was captured on the Docs site / the board instead of a task drawer, so the
reviewer reported an evidence gap pass after pass. Declare an explicit app
target and a route that really serves the screen (`/work?task=9999&tab=changes`
for a drawer), then open the PNG and check it shows the change. AGENTS.md's
shot-hygiene rules apply. Until fixed by #0866, a wrong target is caught only
when the capture fails.

## 2026-10-21 — re-read live state before every action; memory and loop prompts are hints

An overnight loop prompt still said story #0011's chain had not started, and a
driver acted on it: it moved already-landed #0879 from done back to ready and
started an engineer on it, after the whole chain (#0879–#0884) had merged to
main hours earlier. It was only repaired later, by a status-only `mv` to done
that the human authorized.

The failure was not the prompt, it was acting on remembered or summarized state.
Before ANY action on a task (start, restart, message, override, mv, review,
land), re-read it live: `repoos list`, `repoos landable <id>`, and for "not
started" claims `git log main --grep <id>` or the merge history. Handoff docs,
loop prompts, compaction summaries and your own earlier output are hints, never
facts. A task found done or already merged is never reopened; report it.
