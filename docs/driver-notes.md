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
