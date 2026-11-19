## TL;DR

Task #1210 was a QA pass over the system resource panel, pressure-guard banners and `repoos stats` output under the three pressure states (normal, warning, critical). The engineer made the pressure summary visible in every state with plain-language copy that distinguishes advisory warnings from a blocking critical hold, added three deterministic preview fixtures, registered six declared review captures at 1280×900 and 375×900, and committed `docs/qa/2026-11-pressure-states.md`. The code itself was essentially finished after round 1 and found defect-free by every review; the remaining seven hours were consumed by handoff-gate friction: missing declared shots, a missing engineering report draft, and a cross-task bookkeeping file (`work/1211-…`) that repeatedly failed the landing checklist. After 4 engineering rounds and 8 review passes (4 "needs some work", 4 "good to go"), pass 8 returned good to go, close-out succeeded in 411 s, and the task merged as commit `83f0d973fd6d0955093e405cd783d8a7e2a0811a` with status `release:success` on 2026-11-19T07:28:20Z.

## Outcome

What shipped:

- **Resource panel copy for all three states.** Previously the alert rendered only for warning/critical and normal showed bare ratios. Now normal states there is no pressure hold, warning states work continues and the warning is advisory, and critical states that new work is held until blocking signals ease while running agents continue.
- **Matching `repoos stats` explanations** in `src/commands/control-api.ts`: one concise line per level (clear / advisory only / holding), keeping the existing reason and heavy-job output.
- **Three preview fixtures** (`system:pressureNormal|Warning|Critical`) registered in `src/core/shot-fixtures.ts` and the UI fixture switch, sharing a 16 GB machine baseline and varying memory, load, swap, compressor, paging and heavy-job counts by state. Fixtures are explicitly synthetic.
- **Table-driven tests** covering panel status wording, rounded swap/compressor ratios, advisory/critical copy and queued-job counts, plus CLI tests for the three state explanations (focused run: 14 tests passing).
- **QA document** `docs/qa/2026-11-pressure-states.md`, recording viewport sizes, fixture states, rendered status, no-overflow results, the scrolled mobile view, and the limitation that this is a synthetic UI pass, not a live stress test.
- **Six declared shots** (each state at 1280×900 and 375×900, targeting/highlighting `.resource-panel`), all captured with zero console errors.

Headless Playwright only, against the auth-less dev server with fixtures — acceptance criteria met. Final verdict: **good to go** (review pass 8, flagged STALE-EVIDENCE-ONLY because the captures predated the final tree; the reviewer confirmed the panel code was byte-identical between the captured and reviewed trees). Merged commit `83f0d973fd6d0955093e405cd783d8a7e2a0811a`.

## Process stats

- **Created → done:** 2026-11-18T23:47:41Z → 2026-11-19T07:28:20Z, i.e. 7 h 40 min 39 s wall-clock.
- **Engineering rounds:** 4. Round 1 did the implementation; round 2 declared the six shots (no code change); round 3 and round 4 were resumed sessions that changed no product code (round 3 reverted an uncommitted `repoos.toml` edit and touched unrelated bookkeeping; round 4 only added the missing engineering report draft and a `work/1211` bookkeeping edit). All four rounds ran on agent `codex` with model `gpt-6-luna`.
- **Review passes:** 8 — passes 1, 4, 6, 7 "needs some work"; passes 2, 3, 5, 8 "good to go". Passes 1–7 on `codex` / `gpt-6-luna`; pass 8 on `opencode-go/glm-5.3-flash`.
- **Restarts/swaps:** the watchdog restarted the engineer 5 times (01:18:31, 02:01:33, 03:04:55, 03:29:28, 05:11:49), each because a queued message waited 3 min with no live process. Two orphaned engineer processes were adopted (pid 66279 at 00:28:59, pid 94919 at 01:26:14). No reviewer or model swap other than the pass-8 model change.
- **Engineer turn exits without handoff:** 4 (00:59:11, 02:38:47, 03:43:03, and 03:50:44 which ended to deliver a queued message).
- **Tokens (recorded):** engineer session 67,038,012 tokens over 2691 s. Reviewer sessions totalled 1,818,330 tokens across the 8 recorded sessions (49,335; 195,764; 271,778; 299,706; 216,179; 292,579; 262,429; 230,560). Combined recorded total: 68,856,342 tokens. Routing sessions recorded no tokens.
- **Cost (recorded):** only one session recorded a cost — the pass-8 reviewer at 0.01942261. All other costs are not recorded, so a total cost is not known.
- **Close-out gate:** completed in 411 s. Release: success.

## What went wrong

- **Round 1 handoff had no declared shots.** The single auto capture showed the un-fixtured dashboard ("Waiting for resource data"); review pass 1 rejected it even though the engineer had separately run fixture-based headless Playwright passes. Fixed in round 2 by declaring the six shots via `repoos update 1210 --shots`. Durable lesson below.
- **Mobile captures initially showed the panel behind the fixed bottom navigation.** Pass 2 was good to go but suggested recapturing with the panel scrolled into view; the later captures included the full panel and pass 3 confirmed it.
- **Missing engineering report draft.** The handoff gate refused at least twice because `.repoos/engineering-report-drafts/1210.md` did not exist (rounds 2 and 4). Round 4 wrote it, unblocking the gate.
- **Three engineer turns exited cleanly without requesting handoff** (00:59:11, 02:38:47, 03:43:03), plus one turn ended at 03:50:44 specifically to deliver a queued message. Recurring completion reminders were sent.
- **Five watchdog restarts** for queued messages undelivered 3 min with no live process, and one `message_overdue` (still queued after 60 m) at 06:48:24. Each resolved by delivering the queued message to the restarted/next turn.
- **Codex tool-router parse errors** appeared in the 00:59:11 turn's stderr (`unknown field \`question\``, `duplicate field \`title\``). They did not stop the session but coincided with the turn ending without handoff.
- **A `repoos check` failure at the tests step** during the 02:38:47 turn, with failing tests occurring during a high-load run; static checks, build, contrast and UI smoke passed. The engineer declined to hand off; subsequent full scoped checks passed ("All checks passed" in rounds 3 and 4).
- **Machine pressure hold** at 02:29:46: CTO nudge held new work — CPU idle 0% (below 5%), system load 3.5× per CPU (limit 3×). The guard's verdict was respected; work resumed when pressure eased.
- **Cross-task bookkeeping on the branch.** From round 3 onward the branch carried bookkeeping edits for tasks #1211/#1212 and other tasks' report files, and the server-computed landing checklist reported a merge conflict plus task-scope failure in `work/1211-qa-pass-remote-runner-setup-docs-and-run.md`. This caused the "needs some work" verdicts in passes 4, 6 and 7 and twice drove the task into `needs_input` (review-rounds-exhausted), cleared manually by the human at 06:47:48 and 07:17:41. The engineer attempted `repoos sync 1210` but it was refused ("Task #1210 has an agent turn in progress"); the conflict was ultimately resolved by RepoOS's own healing during close-out — the final checklist showed Merge with main: PASS and Task scope: PASS at tree `12062d2`.
- **A handoff gate requested replacing `repoos.toml` with main's version**, which the task explicitly forbids ("Do not touch repoos.toml"). The engineer restored the uncommitted worktree edit to branch HEAD and declined the branch-level rewrite; this did not end up blocking close-out.
- **Review-environment issues:** two passes (3 and 5) could not run `git merge-tree` because the sandbox could not create a temporary file, so mergeability was verified only via the server-computed checklist; pass 8 was triggered by a review-lock sha mismatch (lock at `8f83edc`, worktree at `12062d2`), not a defect. Engineering reports were stale relative to reviewed HEAD in passes 5–8; reviewers judged the diff directly instead.
- **Round 1 test/implementation friction (resolved in-round):** scratch worktree lacked installed dependencies; a typecheck caught a missing `reason: null`; two ratio expectations were wrong (12.5%/43.75% render as 13%/44%); one assertion typo ("do not" vs "does not"); and a hard-coded-color rule violation in the normal banner tint, fixed by dropping the tint.

## Learnings

- **Declared shots are the handoff evidence; ad-hoc headless browser runs are not.** A fixture-based Playwright pass that isn't declared via `repoos update <id> --shots` will fail review even when the UI is verified. This is already the rule in `docs/agent-ui-and-preview-conventions.md`; this task is a concrete example worth citing there.
- **The missing engineering report draft is a hard handoff gate.** Resumed sessions should check for and write the draft *before* running the final scoped check, rather than discovering the refusal afterwards. Worth a line in `docs/agent-workflow-rules.md`.
- **Pressure copy must separate occupancy metrics from the guard's verdict:** warning-level swap/compressor occupancy is advisory and does not hold starts; critical names the blocking signal and clarifies running agents continue. This distinction is now encoded in the fixtures and table-driven tests for both panel and CLI, which is where it belongs.
- **Cross-task bookkeeping conflicts are RepoOS's to heal.** Agents should not hand-edit another task's `work/` files or bypass a sync refusal; the #1076 rule in AGENTS.md ("a task branch's diff holds only its own files") covers this, and this incident shows the refusal ("agent turn in progress") plus close-out healing is the working path — a note in `docs/agent-workflow-rules.md` that sync may be refused mid-turn and that close-out resolves it would save future agents the detour.
- **Watchdog/queued-message interactions caused most of the overnight churn** (5 restarts, 4 turn exits without handoff, one 60-minute overdue message). A look at delivery latency and the 3-minute watchdog threshold in the runner docs may be worthwhile; no task was filed for it.

## Follow-ups

none

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
