---
id: "0288"
title: "Reviewer is not reload-durable, unlike engineer and PM — dies mid-review on every server reload"
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/reviewer-is-not-reload-durable-unlike-en
model_override: default
created_at: "2026-08-24T21:27:29Z"
updated_at: "2026-08-24T22:09:26Z"
check_retry_count: 1
handoff_signal_retry_count: 1
---
## Problem
Reviews are currently failing to complete at a high rate. Confirmed live right now: #0276, #0281, and #0285 all show a reviewer session starting, running for under 2 minutes, then dying with no report (.repoos/reviews/<id>.md never written), no "review completed" line in .repoos/logs/tasks/<id>.log, and no live process. This is not isolated — it is systemic and ongoing.

## Root cause
The server has been self-reloading roughly every 1-3 minutes this whole session (`.repoos/logs/server.out` shows a continuous `reload: spawning replacement ... / reload: replacement is up ... handing over` cycle — every close-out rebuilds `dist/` on `main`, which trips the server's own auto-reload). That cadence is roughly the same as (or faster than) how long a review takes to run, so most reviews are racing the next reload and losing.

The engineer's task-work sessions and the PM's chat sessions both survive this because they share the exact same code path: `AgentRunner.spawnTurn()` (src/server/agents.ts:2530), called from both `run()` (engineer, task.id-keyed) and `startChat()` (PM, sessionId-keyed — confirmed live, e.g. a `pm-task-v2:<id>::<user>` session). That path was deliberately hardened in #0214: it writes stdout/stderr to a durable per-session log file (not just an in-memory pipe) and registers the running process in a durable registry, so when the server reloads, the NEW process's `adoptRunningAgents()` (src/server/agents.ts:2004) re-attaches to the still-alive PID, replays any output written during the handoff gap, and keeps tailing it — the session survives the handoff transparently. The comment at reload.ts:308 spells this out: "in-flight agent children are now durable... the restart proceeds immediately" — #0214 explicitly removed the old deferral-until-idle behavior because this durability made it safe to reload immediately.

The reviewer never got this treatment. `ReviewRunner.run()`/`canRun()` (src/server/review.ts, calling `resolveReviewer`) drives the review through `runPrompt()` (src/server/agents.ts:1801) — a separate, simpler one-shot function: plain `spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] })`, output captured via in-memory `onLine` callbacks and a `Promise` local to the calling server process, no per-session log file, no durable registry entry, nothing for `adoptRunningAgents()` to find. When the process that started the review exits — even via a completely clean, successful reload handoff — the in-flight `runPrompt()` Promise, its `onLine` closures, and the review.ts logic waiting to write the report all vanish with it. The underlying child process may well keep running as an orphan and finish its analysis (confirmed: reviewed transcripts for #0276 show real, substantive investigation happening right up to the point they stop), but nothing is left alive to receive its output or write `.repoos/reviews/<id>.md`.

## Fix
Move the reviewer's one-shot run onto the same durable path the engineer and PM already use, rather than building a second hardening mechanism:
- Route `ReviewRunner.run()` (and the follow-up "Review again" / auto-bounce paths in review.ts) through `AgentRunner.spawnTurn()` (or a thin wrapper around it) instead of `runPrompt()`, keyed by a review-specific session id (e.g. the same pattern PM uses, scoped per task/review-round so it doesn't collide with the task's own engineer session).
- Ensure `adoptRunningAgents()` treats a reload-recovered reviewer session correctly on completion: when the durable session's turn finishes, the code that today runs synchronously after `runPrompt()` resolves (parse the report, write `.repoos/reviews/<id>.md`, log "review completed", trigger `autoBounce`) needs to run from wherever `spawnTurn`/session-completion events are handled, not from a direct `await runPrompt(...)` continuation — check how the engineer's completion side (handoff finalization) is wired for the pattern to mirror.
- If `runPrompt()` is kept for other one-shot uses (check whether anything else besides the reviewer/CTO calls it — resolveCto's cto.ts likely has the same exposure and may need the identical fix), make sure the reviewer specifically no longer depends on the calling process's own lifetime.

## Acceptance criteria
- Start a review, then force (or wait for) a server reload mid-review (e.g. touch a file that trips the build-hash poll). The review completes normally after the handoff: report gets written, "review completed" is logged, auto-bounce (if applicable) still fires — no silent death.
- Re-verify the currently-stuck #0276, #0281, #0285 (or their replacements once retried) do not repeat this failure once the fix lands.
- No change to review behavior/output when no reload happens mid-review (parity with today's happy path).
- `repoos check` green.

## Related
- #0286 — the watchdog never detects a stuck review at all (only scans `active` tasks). That's the "nothing rescues a dead review" gap; THIS task is the "why the review died in the first place" root cause. Fixing #0286 alone would just mean stuck reviews eventually get retried and die again on the next reload — this is the one to land first.
- #0214 — established the durable-session/adoptRunningAgents mechanism this task extends to the reviewer.
- #0271 — established the reload-churn cadence (dist rebuild on every close-out trips auto-reload) that makes this collision frequent in practice.

## Also check
- `resolveCto`/cto.ts likely shares the same one-shot `runPrompt()` exposure — worth a quick check whether CTO runs are hitting the same failure mode and should be covered by the same fix.

## Activity

- 2026-08-24T21:27:29Z · created · unknown
- 2026-08-24T21:28:43Z · status inbox→ready
- 2026-08-24T21:28:44Z · status ready→active, branch
- 2026-08-24T22:09:26Z · model_override
