---
id: "0762"
title: "Mechanical review verification misfires on non-RepoOS repos: guard-test check is JS/TS-only and triggers on any repoos.toml addition"
type: bug
status: review
needs_merge: true
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/mechanical-review-verification-misfires-
created_at: "2026-10-13T08:51:23Z"
updated_at: "2026-10-13T13:24:50Z"
---
## Problem
RepoOS #0714 (src/core/review-verification.ts, src/server/review-verification-gather.ts) appends '## Automated verification' to every review and CLAMPS a 'good to go' verdict to 'needs some work' on failures. It has two checks. The console-errors check applies only to web UI handoff evidence and is skipped for native repos (fine). The guard negative-test check is tied to this repo's own layout and misfires on other projects:
- It looks at src/commands/check.ts and at the repoos.toml diff. For repoos.toml it treats ANY added line with kind = or name = (while the diff contains any command =) as a 'materially changed guard', so adding a [release] block, a [[distribution]] row or a [[shot.targets]] row counts as changing a guard.
- The only evidence it accepts is a changed or existing test file matching *.test.ts, *.test.tsx, *.test.js or *.test.mjs that references the guard and shows rejection of prohibited input. A repo whose tests are Swift, Python, Go, etc. can never satisfy it.
Observed in the Divot repo (native macOS app, Swift tests): #0067 (release config in repoos.toml) and #0081 (shot target in repoos.toml) were each recorded 'needs some work' on 4-6 consecutive passes although the reviewer's own report said 'good to go' with no bugs. The engineer cannot see the Automated verification section from its sandbox, so it had to guess; the maintainer had to override by hand. For #0067 the agent satisfied the check only by adding a throwaway TypeScript test in a Swift project.

## Desired UX
- The guard-test check only applies to guards the project actually declares, and never clamps a verdict because of a repoos.toml edit that does not touch a check guard.
- Projects can configure what counts as a test file (globs) and as negative-test evidence, or turn the guard check off, from Settings.
- The Automated verification section and the reason a verdict was clamped are visible to the engineer agent (for example included in the message sent back to it and in repoos show), not only in the drawer.

## Acceptance criteria
- Narrow guard detection: derive guards from [[check.steps]] (and the built-in RepoOS guards only in this repo's own config), not from every kind/name line in repoos.toml. Adding [release], [[distribution]], [[shot.targets]], [[deployments]], [[agents]] or similar must not count.
- Configurable: a setting (with a Settings UI control and test, per repo rule) for test-file globs and a kill switch for the guard-test check, defaulting to current behaviour only for repos that declare the built-in RepoOS guards.
- A clamped verdict records its reason in the task Activity note and in the text of the 'needs some work' follow-up message to the engineer, so an agent without drawer access can act on it.
- Tests: Swift/Python-style test paths are accepted when configured; unrelated repoos.toml additions do not trigger the check; the clamp message includes the reason.
- Docs (user-docs and docs/) updated.

## Notes for AI
Start from review-verification.ts guardsMateriallyChangedFromDiff and evaluateGuardNegativeTestChecks, GUARD_REVIEW_MARKERS and review-verification-gather.ts. Keep the console-error check unchanged. Zero runtime dependencies.

## Activity

- 2026-10-13T08:51:23Z · created · njachowski@gmail.com
- 2026-10-13T09:00:44Z · status inbox→ready
- 2026-10-13T09:00:49Z · status ready→active, branch
- 2026-10-13T11:05:59Z · status active→review
- 2026-10-13T13:24:32Z · needs_merge
