---
id: "0898"
title: "repoos doctor: warn when macOS syspolicyd/trustd slow spawn-heavy work, and name the git cause"
type: feature
status: active
priority: p2
area: [core, docs]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-doctor-warn-when-macos-syspolicyd
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-21T13:43:26Z"
updated_at: "2026-10-22T13:55:31Z"
handoff_signal_retry_count: 1
---
## Problem
On macOS, an ad-hoc-signed git (Homebrew, mise) makes every real git command cost extra syspolicyd/trustd CPU. Measured 2026-10-21 on a MacBook Air: 600 real git commands took 16-29 s with Homebrew git and 6-8 s with Apple's (syspolicyd +8..19 s vs +0..5 s); a 289-test run took ~160 s vs ~80 s. RepoOS now prefers Apple's git automatically (preferAppleGit), but a user whose Command Line Tools are missing, who set REPOOS_PREFER_APPLE_GIT=0, or who runs other ad-hoc-signed tooling gets no signal about why their machine is slow.

## Desired UX
`repoos doctor` (and the Runners/Settings health area) detects macOS, checks whether the first git on PATH is ad-hoc signed (codesign -dv) and whether Apple's git is available, and prints one actionable line: what is slow, the measured cost, and the fix (install Command Line Tools, or unset REPOOS_PREFER_APPLE_GIT). It also samples syspolicyd CPU time over a short window and warns when it is high while spawn-heavy work runs.

## Acceptance criteria
- doctor reports: preferAppleGit active or not, why not, and the first git on PATH with its signature kind.
- A warning appears only on macOS and only when a real cause is found; no noise elsewhere.
- Template AGENTS.md (src/commands/init.ts) and docs/driver-notes.md mention: do not benchmark with git --version (cheap), measure real commands.
- Tests cover the signature detection with fake binaries and the non-macOS no-op.

## Notes for AI
See src/core/runtime.ts preferAppleGit, user-docs/configuration.md (Apple-signed git on macOS) and docs/driver-notes.md 2026-10-21 entry. Developer Tools exemption did NOT help; do not recommend it.

## Activity

- 2026-10-21T13:43:26Z · created · njachowski@gmail.com
- 2026-10-21T14:01:32Z · status inbox→ready
- 2026-10-22T13:19:16Z · cli_override, model_override
- 2026-10-22T13:19:16Z · status ready→active, branch
- 2026-10-22T13:26:44Z · body
- 2026-10-22T13:29:50Z · body
- 2026-10-22T13:30:58Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T13:38:35Z · message_queued at 2026-10-22T13:38:35.513Z
- 2026-10-22T13:38:35Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-22T13:38:50Z · body
- 2026-10-22T13:40:56Z · body
- 2026-10-22T13:41:35Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-22T13:41:35Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T13:41:36Z · message_delivered: 1 message(s)
- 2026-10-22T13:50:26Z · handoff failed · remote validation failed: test failure: tests/doctor.test.ts > runDoctor > names an ad-hoc-signed first git when Apple git preference is disabled on bee — fix it in the feature branch and re-run the gate
- 2026-10-22T13:55:30Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/doctor.test.ts > runDoctor > names an ad-hoc-signed first git when Apple git preference is disabled on bee — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-22T13:55:30Z · note: handoff requested (cli)
