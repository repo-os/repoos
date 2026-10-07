---
id: "0710"
title: "Docs: write the overnight-run lessons (provider-failure scraper, self-check starvation, driver tips) into the repo"
type: chore
status: done
priority: p2
area: docs
story: "Field report: first agent-driven project run (opex)"
merged_commit: 782b40806e09b6c073461c588140509cb5f84739
assigned_to: ai
created_by: ""
branch: feat/docs-write-the-overnight-run-lessons-pro
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T08:37:40Z"
updated_at: "2026-10-07T17:10:15Z"
---
## Problem

Durable lessons from the 2026-10-06 overnight triage run live only in /Users/nick/code/jago/opex/repoos/docs/ (the log and a session handoff) and in chat, not in this repo, which breaks the "the repo is the system of record" rule in AGENTS.md.

## Desired UX

Add a short section to docs/debugging-check-failures.md and docs/close-out-pipeline.md (or one new docs/agent-run-operations.md linked from docs/README.md) covering: (1) the provider-failure scraper false positive (#0709): what scrapeProviderFailure may inspect and why whole stream-json lines must never be substring-matched; how to recognise it (task needs_input provider-failure whose detail is a random JSON line, agents die with empty stderr); (2) standalone self-check slot starvation and the host-lock / dispatcher rules (#0694, #0705, #0706); (3) driver tips: spawn a turn with POST /api/tasks/<id>/message when /start leaves nothing running, verify PATCH responses, active<->review flips are the interceptor, re-handoff after a conflict merge needs mv active then mv review, never commitDirty unless only bookkeeping is dirty; (4) when to use cheap Cursor models.

## Acceptance criteria

- Docs updated and linked from docs/README.md; no code change. repoos check passes.

## Notes for AI

Source material: /Users/nick/code/jago/opex/repoos/docs/overnight-log-2026-10-06.md and session-handoff-2026-10-06-pm.md. Docs-only, small.

## Lessons added 2026-10-07 (second night; evidence is in the overnight log and handoff doc in /Users/nick/code/jago/opex/repoos/docs/)

Write each as a short entry: symptom, how to recognise it, cause, what to do, and the task that fixed or tracks it. Verify each against current main first; some are fixed since.

1. **Degenerate-output detector (#0678 / #0718).** It used to scan tool payloads and results, so file edits with long separator lines or repeated closers killed healthy agents. Now it scans assistant text only and the message names the rule. A real model loop (e.g. repeated tag spam) needs a FRESH session; resuming re-poisons it.
2. **Handoff gate config.** The handoff gate runs `repoos check` inside the TASK WORKTREE and reads the worktree's committed repoos.toml, so a config change made only on main never reaches existing branches until main is merged into them. The local (non-remote) handoff check has a hard 240 s cap (src/server/handoff.ts), so turning remote validation off cannot work for handoffs.
3. **Loop guard.** A re-review of an unchanged branch tip after a known identical failure is refused (#0693); an empty commit changes the tip.
4. **validate.sh rollout and argument order (#0717 / #0725).** Hosts carry a root-owned /opt/repoos/validate.sh; a newer server against an older script, and an argument-position bug (mirror path landing in $4 when there is no changed ref; fixed by hotfix 0ae3dd82b + #0725) made every remote handoff fail with 'cloned an empty repository' (exit 128). Recognise it by the 4-8 s remote failure; fix by updating the host script and keeping the empty $4 placeholder.
5. **Close-out time budget.** Healthy remote gates are about 270-300 s; a full upload used to dominate on a bad network (a ~25 MB bundle, 25 minutes on a throttled hotspot or with the laptop asleep). Anything over 1.5x the median means something is wrong (#0720). Incremental mirror uploads (#0717) cut the upload.
6. **Hung and killed runs (#0729, #0739).** Validation containers can hang with the host idle; the hang detector must not call a finished run hung (a gate exit already printed is a real failure and must not be retried as 'transient', which masked a genuine test failure on #0737), a kill must be bounded and release the slot, and an UNREACHABLE host never counts as idle so the detector cannot see it: cancel with POST /api/tasks/<id>/done/cancel and retry (the pool should then avoid the host).
7. **Bookkeeping commits and close-out.** Task-file, inputs and stories commits on main are exempt from close-out drift handling (src/server/integration-orchestrator.ts bookkeepingDirPrefixes). Untracked task files left by a failed fail-soft commit block close-out as dirty main; trigger the commit again via PATCH, or use /done with {commitDirty:true} only when every dirty file is work/*.md bookkeeping.
8. **Serial close-out queue.** One close-out runs at a time (each merge reloads the server); a stuck active job blocks everything behind it, and the board card labels the active job 'queued' until a stage is reported (#0740).
9. **Agent liveness.** Cursor 'RetriableError: Connection stalled repeatedly' means the network dropped (plain /start resumes); a looped session needs /start {"mode":"fresh"}; /message only works when the agent is idle; verify cli_override in the task file after PATCH (an override was silently lost once).
10. **Driver hygiene.** Never run serve-noauth or leave a task preview running from a task worktree (it commits other tasks' bookkeeping onto that branch and makes handoff fail with 'HEAD moved'); a stale 'HUNG . KILLING' entry in the Remote runners tab clears on a server restart.
11. **Easter eggs bundles** are the sanctioned alternative to hotfixes (docs/easter-eggs-bundles.md); direct commits to main only when the owner explicitly asks (one such hotfix, 0ae3dd82b, was made with approval).

Keep it concise: one new docs/agent-run-operations.md (or the two existing docs), linked from docs/README.md; also add the one-line operating rules to AGENTS.md only where they are rules agents must follow (items 2, 3, 9, 10).

## Activity

- 2026-10-06T08:37:40Z · created · unknown
- 2026-10-06T08:37:43Z · story
- 2026-10-07T01:15:43Z · cli_override, model_override
- 2026-10-07T01:15:49Z · note: DRIVER scope/current-version requirement: use the latest session-handoff-2026-10-07-am.md UPDATE00:40Z plus overnight-log current entries; older pm handoff is superseded. Independently check every proposed rule against current main and AGENTS.md. #0723 now provides authenticated CLI control-plane commands; document those rather than obsolete curl/session advice. Do not repeat unproven claims that task bookkeeping restarts validation, that stale host scripts alone caused the mirror bug, or that silence proves model/network failure. Preserve incident context separately from current operating rules. No code/config/main commit/server/host changes. Docs-only; do not modify unrelated docs or AGENTS rules outside the task scope.
- 2026-10-07T01:16:17Z · status inbox→ready
- 2026-10-07T01:16:22Z · status ready→active, branch
- 2026-10-07T01:38:22Z · status active→review
- 2026-10-07T02:55:19Z · status review→done, release:success
- 2026-10-07T17:10:15Z · body
