---
id: "1096"
title: Guard against huge/build-output files in WIP checkpoint commits and branch diffs
type: bug
status: review
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/guard-against-huge-build-output-files-in
created_at: "2026-11-11T10:29:43Z"
updated_at: "2026-11-11T21:17:52Z"
last_handoff_failure_fingerprint: "check|repoos check failed: check-fmt:check — Formatting failed — run `bun run fmt` to fix:"
last_handoff_failure_sha: 6e68569cdbc78040106828753090228e88172c2f
review_rounds: 1
routing_switches: 1
review_passes: 1
last_check_failure: "repoos check at 2026-11-11T18:02:32.813Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-11-11T19:48:26.351Z\",\"reason\":\"handoff-deferred\"}]"
deferred_handoff_resume_count: 1
---
## Problem
On 2026-10-21 the engineer WIP checkpoint commit 5607e2aaa (#0892) staged 4,763 Xcode build files from macos/.derived-data-verify/ (~271 MB raw, ~160 MB compressed) into public history. The existing .githooks/pre-commit only runs on main and only checks format/lint, and checkpoint commits are made by RepoOS code (src/core/engineer-checkpoint-commit.ts), so nothing noticed.

The files were NOT harmless: several .xcresult Data blobs are Zstandard-compressed and, once decompressed, contain machine-wide diagnostics (process lists, memory regions, other apps' data such as Raycast clipboard history) including live Stripe restricted keys and Google API keys. GitHub secret scanning and push protection were ON and did not flag it, because they read plain text and cannot see inside compressed binaries. An outside researcher found it. So the safety net must be ours: path rules, size limits, and a content scanner that decompresses first. Purge is tracked in #1095.

## Desired UX
Large or build-output files can't silently ride a task branch into history. The checkpoint code skips and reports them; the check gate fails on them; interactive commits get a warning.

## Acceptance criteria
- The WIP checkpoint commit unstages and reports (does not commit) paths matching build-output patterns (.derived-data*, *.xcresult, DerivedData, .build) and, when the staged set exceeds a threshold (about 200 files or 5 MB), fails loudly or unstages the excess. Test with a fixture worktree.
- A new [[check.steps]] guard (like task-assets) fails when the branch diff vs main adds any file over about 1 MB or any build-output path, with an explicit allowlist for deliberate large files. Test proving it fires on a synthetic 2 MB file and an .xcresult dir.
- Secret-content scan: the same guard (and the checkpoint commit) scans ADDED file contents for secret patterns (Stripe sk_/rk_/whsec_, Google AIza, AWS AKIA/ASIA, GitHub ghp_/github_pat_, Anthropic sk-ant-, Slack xox) and FAILS if found. It must decompress zstd, gzip and zlib payloads before matching (GitHub cannot), and must bound decompressed size and file count so it cannot be used to exhaust memory. Test: a fixture file with a fake pattern-matching key inside a zstd-compressed blob is caught; a random base64 blob is not (no false positives from base64 noise). Never print matched values; show only type, path and last 4 chars.
- Xcode/test output must not be produced inside the repo tree: macos scripts and docs use a derivedDataPath and result bundle path outside the repo (for example under ~/Library/Developer/Xcode or a gitignored dir that checkpoint also refuses), and the cause of the machine-wide diagnostics being collected into the .xcresult is identified and disabled or documented (macos/scripts, docs/macos-hub-snapshots.md, macos/README.md).
- .githooks/pre-commit warns or blocks on staged files over the threshold on ANY branch (not just main), with a documented override. Must not block RepoOS's own commits unexpectedly.
- Thresholds and the pattern list are configurable in repoos.toml with a Settings UI control per AGENTS.md. Docs updated (user-docs/check.md), including that GitHub secret scanning does not cover compressed binaries and that push rulesets with a file-size limit are a complementary remote guard.

Out of scope: rewriting history (#1095).

## Notes for AI
Do not rewrite history here; that is #1095. Keep zero runtime dependencies. Mirror the task-assets guard structure.

## Activity

- 2026-11-11T10:29:43Z · created · njachowski@gmail.com
- 2026-11-11T10:43:57Z · body: Problem (added 2, removed 1)
- 2026-11-11T10:43:58Z · body: Acceptance criteria (added 4, removed 2)
- 2026-11-11T15:38:28Z · status inbox→ready
- 2026-11-11T15:38:32Z · status ready→active, branch
- 2026-11-11T15:43:44Z · message_queued at 2026-11-11T15:43:44.699Z
- 2026-11-11T15:48:16Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T15:53:30Z · message_queued at 2026-11-11T15:53:30.633Z
- 2026-11-11T16:43:50Z · queued message undelivered for 60m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-11T16:43:50Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: Creating the core guard module and wiring it through the checkpoint flow, check gate, pre-commit hook, and macOS scripts. · stderr: (empty)
- 2026-11-11T16:43:51Z · message_delivered: 2 message(s)
- 2026-11-11T17:28:53Z · body
- 2026-11-11T17:33:14Z · CTO nudge: held — handoff gate is running
- 2026-11-11T18:02:25Z · message_queued at 2026-11-11T18:02:25.649Z
- 2026-11-11T18:02:32Z · message_delivered: 1 message(s)
- 2026-11-11T18:23:31Z · body
- 2026-11-11T18:33:15Z · CTO nudge: held — handoff gate is running
- 2026-11-11T18:35:50Z · status active→review
- 2026-11-11T18:35:50Z · message_queued at 2026-11-11T18:35:50.879Z
- 2026-11-11T18:35:51Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-11T18:38:22Z · note: review pass 1: needs some work
- 2026-11-11T18:38:24Z · message_delivered: 1 message(s)
- 2026-11-11T18:38:25Z · status review→active
- 2026-11-11T18:53:14Z · message_queued at 2026-11-11T18:53:14.921Z
- 2026-11-11T18:53:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T18:58:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T19:14:42Z · body
- 2026-11-11T19:23:16Z · CTO nudge: held — handoff gate is running
- 2026-11-11T19:42:25Z · handoff failed · remote validation failed: test failure: tests/debugger-integration.test.ts > debugger agent integration > runs a diagnosis when enabled and serves it back, tests/debugger-integration.test.ts > debugger agent integration > does not re-broadcast a turn the panel already drew optimistically (#0443), tests/mtd-docs-fast-path.test.ts > validateCandidate docs-only fast path (#0355) > runs a declared bootstrap check without inventing a build step on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-11T19:42:25Z · message_queued at 2026-11-11T19:42:25.805Z
- 2026-11-11T19:43:16Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T19:48:26Z · watchdog: auto-resumed engineer to read a deferred handoff message · resume 1/3
- 2026-11-11T19:48:30Z · message_delivered: 1 message(s)
- 2026-11-11T19:58:16Z · message_queued at 2026-11-11T19:58:16.050Z
- 2026-11-11T19:58:16Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T19:59:52Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T20:17:32Z · body
- 2026-11-11T20:38:12Z · note: handoff requested (cli)
- 2026-11-11T20:38:17Z · CTO nudge: held — handoff gate is running
- 2026-11-11T20:49:34Z · body
- 2026-11-11T20:49:36Z · body
- 2026-11-11T20:50:32Z · message_queued at 2026-11-11T20:50:32.339Z
- 2026-11-11T20:50:32Z · handoff failed · task-file handoff failed at check · repoos check failed: check-fmt:check — Formatting failed — run `bun run fmt` to fix:
- 2026-11-11T20:51:13Z · note: handoff requested (cli)
- 2026-11-11T21:16:18Z · message_overdue: still queued after 60m without being delivered
- 2026-11-11T21:17:51Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-11T21:17:51Z · message_queued at 2026-11-11T21:17:51.414Z
- 2026-11-11T21:17:51Z · ↻ resuming engineer to read queued message
- 2026-11-11T21:17:52Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: **#1096 — Guard against huge/build-output files** Implementation covers the branch-artifact guard (checkpoint, `branch-artifacts` step, pre-commit, macOS docs), review fixes (fail-closed scan, checkpoint unstage ordering, staged blobs, etc… · stderr: (empty)
- 2026-11-11T21:17:52Z · status active→review
