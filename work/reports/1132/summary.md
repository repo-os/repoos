## TL;DR

Task #1132 shipped **allowlist groups**: a project can join a named group via
`budget.allowlistGroup` in its `repoos.toml`, and the group's CLIs, models and
pause state live outside any repo in
`~/.config/repoos/allowlist-groups/<name>.toml` (versioned, last-writer-wins,
never committed, no secrets). A pause or resume from Budget Controls or
`repoos allowlist pause|resume` updates the group locally (members on the same
machine pick it up via the config watcher) and reaches same-group tailnet
members over authenticated SSH using the same trust path as tailnet discovery
(#1127), after a confirmation lists the projects and hosts affected. The merge
rule is group-as-base, project-rows-as-overrides with pause-wins; projects
without a group behave exactly as before. Budget Controls shows the group name,
per-entry provenance, drift and a Re-sync action. Two review passes ran: pass 1
found a browser-config bug (fixed), pass 2 returned `good to go`. Two handoff
attempts failed (report word limit; a remote-validation test failure) before
close-out completed and the task landed as `release:success`. A real
multi-host tailnet smoke test was not performed and no task was filed for it.

## Outcome

The feature shipped and was merged to `main` as commit `668410a1cb641028c604159f3bba4e236549daf0`; the task closed as `done` with `release:success`.

In plain terms: Nick's projects can now declare a shared allowlist group (for example `personal` or `acme`) instead of hand-editing `[[budget.allowlist]]` in every repo on every machine — the exact chore that triggered this task on 15 Nov 2026 when Codex came back and tuk-driver, neung, laisen, repoos and tiao each had stale pauses to remove separately. Group state is stored per machine, not in git, so one pause/resume updates every member project on that machine and, via tailnet discovery over SSH, on other hosts — while projects in a different group (and ungrouped projects) are untouched. Logins and credentials are never synced; a member that isn't logged in to an allowed CLI reports that instead of failing silently. The final review verdict was `good to go` (pass 2, 2026-11-15T18:44:28Z).

## Process stats

- **Wall-clock, created → done:** 2026-11-15T15:20:04Z → 2026-11-15T19:37:32Z = 4 h 17 min 28 s. From `active` (16:58:12Z) to done: 2 h 39 min 20 s.
- **Engineering rounds:** 1 recorded engineering report (round 1), plus a round-2 fix commit (`3e00712`) addressing the pass-1 review finding. One engineer session.
- **Review passes:** 2 — pass 1 `needs some work`, pass 2 `good to go`.
- **Agents and models:**
  - Engineer: `engineer` on `opencode-go/deepseek-v4.1-flash` (opencode), session started 16:58:18Z, elapsed 5549 s (1 h 32 min 29 s), 250,469 tokens, cost recorded as 0.21387466200000002 USD. No restarts or model swaps recorded.
  - Reviewer: `reviewer` on `composer-2.5` (cursor), two sessions — 105 s (pass 1) and 45 s (pass 2). Tokens and cost for reviewer sessions: not recorded.
  - Routing: three `Model router (openrouter)` sessions, model `unknown`, 1 s / 1 s / 0 s, tokens and cost not recorded.
- **Close-out gate:** completed in 1360 s (22 min 40 s), finishing 19:37:15Z.
- **UI verification:** passed twice (18:03:16Z and 18:57:42Z), each "1 of 1 shot captured with clean console" with 1 shot warning.
- **Linked tasks at close:** none recorded.

## What went wrong

- **Review pass 1 bug — browser config contract.** `safeConfigForBrowser` in `src/server/routes/config.ts` flattened `budget.allowlist` but not `budget.allowlistGroup`, so joined projects never saw their group via `GET /api/config`, the UI treated grouped repos as project-only, and `repoos allowlist pause|resume` would have written to committed rows instead of the group. Resolved in the round-2 commit (`3e00712`), with a flattening test; pass 2 verified the fix and returned `good to go`.
- **Two engineer turns ended without a handoff (exit code 130).** While the engineer was waiting on the scoped check, CTO completion-reminder nudges were queued but undelivered (each further nudge was held because a message was already queued). The runner ended the turns at 18:33:40Z and 18:37:10Z solely to deliver the queued messages. Resolved by ending the turn, delivering the messages, and requesting handoff via CLI at 18:37:11Z; the review request then took effect at 18:43:41Z.
- **Handoff failure 1 — report too long (18:57:43Z).** The task-file handoff failed at review because the engineering report narrative was 1263 words against a 1200-word hard limit. Resolution: the report had to be shortened and handoff re-requested (the record shows the task proceeded to close-out afterwards; the specific retry is not separately logged).
- **Handoff failure 2 — remote validation test failure (19:07:36Z).** `tests/remote-host-pool.test.ts > host-side lock (server + standalone CLI share one limit) > lets a holder expire the waiter with a clear timeout instead of a red gate on bee`. A message was queued to the engineer to fix it on the feature branch and re-run the gate. The close-out gate then completed in 1360 s and the task closed successfully; the record does not describe the actual fix.
- **Stale shot target.** The engineering report and UI verification JSON referenced commit `5e8edc194` while the reviewed HEAD was `3e007122`. The reviewer judged the existing PNG valid for the unjoined UX but predating round 2 and suggested a re-capture; not recorded as re-captured.
- **Shot warning (×2).** Both UI verification passes reported 1 shot warning; the reviewer attributed the transient "server not responding" banner in the PNG to preview timing, not a UI defect.

## Learnings

- **Group state is machine state, not project source.** Keeping the allowlist group out of git (XDG file, overridable with `REPOOS_ALLOWLIST_GROUPS_DIR`) eliminates the "edit and commit four repos" class of work and makes last-writer-wins natural. Worth a line in `AGENTS.md` or a pointer from `docs/` if other machine-local coordination state follows the same pattern.
- **Pause-wins is the safe merge default.** A merge rule that lets a local row silently un-pause a group would break the core promise; union for models plus pause-wins, with the UI drift warning making intentional local overrides visible. This belongs in `docs/allowlist-groups.md` (already written, +73 lines) if not there in full.
- **Reuse existing trust seams.** Rejecting a new HTTP write endpoint in favour of the SSH path discovery already uses avoided inventing a shared token secret; extending `ConfigWatcher`'s change signature to the group file avoided a second reload mechanism. Candidate for a short ADR on cross-machine coordination state.
- **Flatten every new top-level config key for the browser contract.** The pass-1 bug (a key enforced server-side but invisible to `GET /api/config`) is a recurring trap; a `safeConfigForBrowser` test per new key is the guard.
- **Verification limits to carry forward:** real multi-host propagation was test-faked only (discovery filtering and SSH contract via a fake transport); enforcement-time expiry of timed pauses (not group-file rewrites) matches existing budget behaviour. The reviewer twice suggested a human pause/resume smoke across bee/thinkpad after merge — no task was filed for it, so this is flagged here rather than tracked.

## Follow-ups

None recorded — no linked tasks were filed from this task. (Notably, the reviewer's twice-made suggestion of a human tailnet pause/resume smoke test on bee and thinkpad never became a task; if the human wants live verification, it needs to be filed explicitly.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
