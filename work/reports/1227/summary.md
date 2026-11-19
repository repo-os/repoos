## TL;DR

A QA pass audited `user-docs/` against `repoos --help`, `getConfigSchema()` and the live UI labels. It found two real inaccuracies — the agent registry had grown from eight to eleven coding CLIs, and the `--help` banner omitted the real `secrets bindings` subcommand — fixed them, plus the same drift class in `secrets`' own usage string and `docs/agent-model-recommendations.md`, pinned the drift class with a new test, and committed the required QA report at `docs/qa/2026-11-user-docs-accuracy-qa.md`. Six review passes, all "good to go"; merged as `dc68eb642174cb3eafae5a54d8b8a55ce3ef1cb9` and released. The session started rocky (provider-quota fallback, an engineer crash, watchdog restarts) and stalled once on an undelivered message, but no check gate or review ever failed.

## Outcome

A new user following `user-docs/` now finds the screens, commands and defaults as they actually are:

- `user-docs/agents.md`: "eight coding CLIs" corrected to eleven, with new rows for `crush`, `pi` and `muse` (+4/−1), matching `KNOWN_AGENTS` in `src/core/detect.ts` and the driver dispatch in `src/server/agents.ts`.
- `src/cli/help.ts` (+1/−1): the `secrets` usage line in the `--help` banner now includes `bindings`, matching both the implementation and `user-docs/cli.md` — the docs were right and the banner was stale.
- Review-fix round (commits `255b18eab`/`ffed8cd0d`, after pass 2): `SECRETS_USAGE` in `src/commands/secrets.ts` now covers all six dispatched actions including `bind` and `bindings`; a new `src/commands/secrets.test.ts` pins `SECRETS_USAGE` and the banner against `SECRET_ACTIONS`; `docs/agent-model-recommendations.md` corrected from "eight" to "eleven coding-agent CLIs".
- Deliverable committed: `docs/qa/2026-11-user-docs-accuracy-qa.md`, recording method, changes, and the verified-without-changes list (154 doc config rows confirmed against the schema; all quoted CLI help blocks re-captured; UI routes/labels cross-checked).

The scoped check gate passed; all six review passes returned "good to go"; close-out finished with `release:success` at merged commit `dc68eb6`.

## Process stats

- **Wall-clock, created → done:** 2026-11-19T09:47:43Z → 2026-11-19T13:58:59Z, i.e. 4 h 11 m.
- **Dev rounds:** 1 engineering round recorded (round 1, 2026-11-19T10:50:58Z). A review-fix round after pass 2 produced commits but no round-2 engineering report (noted by passes 3–6 as a stale-report edge case).
- **Review rounds:** 6 passes (10:52:10, 11:18:49, 11:57:32, 12:18:17, 12:48:16, 13:25:28Z), all verdict "good to go". Code was unchanged from pass 3 onward; passes 4–6 re-verified bookkeeping only.
- **Agents and models:** engineer and reviewer both `opencode` on `opencode-go/glm-5.3-flash`. The pre-assigned pair `codex + gpt-6-luna` was paused out of usage since 07:09:32Z (provider quota), so this fallback pair ran the whole task — no mid-task model swap. 8 routing sessions ("Model router (jev)") ran with model, tokens and cost not recorded.
- **Restarts:** 1 crash-recovery resume (1/3 crashes in 30m), 1 failed watchdog auto-resume, 2 watchdog restarts (10:28:44Z after 11 m with no live process; 10:45:14Z for a queued message waiting 3 m).
- **Tokens and cost** (from the sessions table; totals are additive sums of the recorded rows): engineer 614,851 tokens / $0.31969333 in one 2198 s session; six reviewer sessions totalling 203,790 tokens / $0.06036493 and 311 s combined; grand total 818,641 tokens / $0.38005826. Routing sessions: no tokens or cost recorded.
- **Close-out gate:** completed in 644 s.

## What went wrong

- **Provider quota (pre-existing):** `codex + gpt-6-luna` was paused out of usage since 07:09:32Z; the task ran on the fallback pair `opencode + glm-5.3-flash`. Noted twice (at start and again at 13:17:49Z). Resolved by the fallback; no action needed.
- **Orphaned engineer:** pid 95418 was stopped at 09:51:25Z.
- **Engineer crash:** the agent process exited with an error at 09:51:27Z; crash recovery resumed the same agent/model (1/3 crashes in 30m). A `needs_input` marker was set at 09:51:29Z. The recovered session re-verified every load-bearing claim from scratch rather than trusting the prior transcript.
- **Failed watchdog resume:** the 09:58:29Z auto-resume failed because the worktree already had a recorded live engineer (pid 4050). The watchdog restarted the engineer at 10:28:44Z after 11 m with no live process, and again at 10:45:14Z when a queued message waited 3 m; the message was delivered at 10:45:15Z.
- **Two returns from review:** after pass 2 (11:18:49Z, "good to go" with non-blocking suggestions), the task went back to active at 11:47:36Z and the pass-2 suggestions were actioned as the review-fix round (usage strings, test pin, doc count), re-entering review at 11:56:21Z. Passes 3–5 were all "good to go", yet the task returned to active once more at 13:17:43Z before pass 6.
- **Undelivered message stall:** a message queued at 11:56:44Z went undelivered for over an hour; the overdue alarm fired at 13:01:24Z. A CTO nudge at 13:17:43Z was held because the undelivered message was still queued; the message was finally delivered at 13:17:52Z after the return to active. Two later messages queued at 13:25:27Z and 13:29:46Z; the log does not record their delivery.
- **Stale engineering report:** from pass 3 onward, reviewers noted the attached report was still round 1 (commit `a165c61`) while the tree had moved; no round-2 report was generated, and each reviewer verified the newer work directly instead.
- **Shots skipped:** the handoff shot capture was skipped three times ("Docs site skipped: no docs shot declared") — appropriate for a docs-only task, and no UI smoke test applied.

## Learnings

- **Docs QA is direction-sensitive.** Checking "does every schema key have a doc row?" yields 42 false "missing" keys; checking "is every doc row true?" (154 rows → schema lookup) yields a small, verifiable set. The second direction is the acceptance criterion. Recorded in the QA report; worth keeping there as the canonical method note.
- **Hand-maintained usage strings drift from dispatch logic** — the `--help` banner, `secrets`' self-usage line and per-command copies are maintained separately and drift independently ("the docs were right, `--help` was stale" is a real failure class). This task pinned the class with `src/commands/secrets.test.ts`; sibling copies in `docs.ts:133`, `reminder.ts:5` and `checks.ts:134` remain unpinned and belong in the follow-up below. A one-line rule in `AGENTS.md` (or a short docs note) that usage strings must be generated from or tested against the dispatch set would prevent the next instance.
- **Derived-default columns ("derived from CPU count") can look like drift against a numeric schema default** but be more accurate than the metadata; verify against the resolver (`defaultMaxConcurrentAgents()`), not the schema placeholder. Recorded in the QA report.
- **After a crash-resume, re-verify rather than trust the prior transcript.** Cheap, and it turned the report's claims into observations.
- **Repeated "good to go" passes over an unchanged tree (passes 4–6 re-verified bookkeeping only) cost three reviewer sessions (~107 s, ~75k tokens) without new information.** A process tweak — closing review once the verdict repeats on an unchanged HEAD — belongs in `docs/agent-workflow-rules.md` if the team agrees.

## Follow-ups

- **#1229** — reconcile the `repoos --help` banner with per-command `--help` (known gaps: `check --fix/--step`, `doctor --yes`) and the remaining hand-maintained usage strings (`docs.ts`, `reminder.ts`, `checks.ts`); filed from the recurring banner/usage drift class this task exposed. Its existence on the board was verified read-only by review pass 3 and it is referenced in the QA deliverable, although this task's Linked-tasks field records none.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
