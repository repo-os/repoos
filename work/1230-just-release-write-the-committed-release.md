---
id: "1230"
title: "Easter eggs bundle: just release writes the release record"
type: bug
status: active
priority: p2
area: release
assigned_to: ai
created_by: t@t
branch: feat/easter-eggs-bundle-just-release-writes-t
created_at: "2026-11-19T13:45:13Z"
updated_at: "2026-11-23T12:06:49Z"
---
## Items

- [ ] **E1 · just release writes the release record** (release) — `just release` bumps only package.json, so the release-record test fails; write the record too. Source: human report, 19 Nov.

Every item below uses the same four sub-headings. Edit items with `repoos update <id> --section`, never a full `--body` replace.

## E1 · just release writes the release record

### Problem
`just release 0.5.92` (run 19 Nov) failed in `repoos check`: tests/release-history.test.ts "the committed release record > matches the package version so every surface names the shipped release" expected '0.5.91' to be '0.5.92'. The recipe only bumps package.json, but a release now also needs the committed release record (`CURRENT_RELEASE` in shared/release, with notes), which the Releases page flow writes (v0.5.91 was recorded in commit 809a004e9). Nothing was tagged or pushed, and package.json was reverted.

### Desired UX
`just release <version>` gives the same result as cutting the release from the Releases page: package.json and the release record updated in one release commit, then checks, tag and push. If the checks fail, main is left as it was.

### Acceptance criteria
- `just release X.Y.Z` on a clean main updates package.json and the committed release record together, and tests/release-history.test.ts passes.
- If the checks fail, the recipe restores package.json and the record (no leftover bump).
- The recipe writes the release record through the same code as the Releases page (no duplicated logic), with a test covering the recipe's record step.

### Notes for AI
Start from the `release` recipe in justfile, shared/release.ts (CURRENT_RELEASE, releaseStamp), src/ui-app/tests/release-history.test.ts, and commit 809a004e9 (how v0.5.91 was recorded). Don't push or tag while working on this task.

## Activity

- 2026-11-19T13:45:13Z · created · t@t
- 2026-11-19T13:49:22Z · title, body: Items (added); E1 · just release writes the release record (added); Problem (removed); Desired outcome (removed); Acceptance criteria (removed); Notes for AI (removed)
- 2026-11-23T07:34:23Z · status inbox→ready
- 2026-11-23T10:18:49Z · status ready→inbox
- 2026-11-23T10:18:56Z · status inbox→ready
- 2026-11-23T11:53:18Z · status ready→active, branch
- 2026-11-23T12:03:39Z · message_queued at 2026-11-23T12:03:39.045Z
- 2026-11-23T12:03:39Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-23T12:04:05Z · body
- 2026-11-23T12:06:49Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
