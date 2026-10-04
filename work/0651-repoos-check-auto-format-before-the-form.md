---
id: "0651"
title: "repoos check: auto-format before the format check, and end with a failed-steps summary + rerun hint"
type: feature
status: active
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/repoos-check-auto-format-before-the-form
created_at: "2026-10-04T16:32:00Z"
updated_at: "2026-10-04T18:37:11Z"
---
## Problem
Engineer agents lose turns in the check-gate loop (analysis of 234 engineer sessions, 2026-10-05): repoos check ran 477 times in 215 sessions; 130 sessions ran it more than once; roughly a third of runs failed. 13 runs in 11 sessions failed only on formatting (check-fmt:check only reports; it never reformats). Agents also pipe the check through tail/grep, miss the failing step, and rerun it (one session ran the same check 4 times).

## Desired UX
- Formatting is fixed, not just reported: repoos check runs the formatter before check-fmt:check, or offers a --fix mode that does. Decide which; the gate at close-out must still verify the committed tree, so any auto-format must happen before the tree is snapshotted and never silently change what was tested. Handoff should also run bun run fmt and commit the result.
- Every repoos check run ends with a short, fixed-position summary: failed step names, and the exact command to rerun only that step. Short enough that tail -20 always contains it.

## Acceptance criteria
- A format-only violation no longer fails repoos check --changed main (or the failure message names the one command that fixes it).
- Close-out still fails on unformatted trees (the gate is not weakened); test covers this.
- Output ends with a failed-steps summary with per-step rerun commands; tests cover pass, single-fail, multi-fail.
- user-docs/check.md and the AGENTS.md 'run bun run fmt' lines are updated to match.
- Respect the repoos.toml check-plan model (name + command/kind); do not hard-code RepoOS-specific steps in src/commands/check.ts.

## Notes for AI
Format step is kind="format" in check-plan.ts / repoos.toml (check-fmt:check). dependsOn already skips build/tests/smoke when fmt or lint fail (43698be0a). Related: #0639 is unrelated (pi session id).

## Activity

- 2026-10-04T16:32:00Z · created · unknown
- 2026-10-04T16:56:44Z · priority
- 2026-10-04T17:42:51Z · status inbox→ready
- 2026-10-04T17:48:39Z · status ready→active, branch
- 2026-10-04T18:37:11Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
