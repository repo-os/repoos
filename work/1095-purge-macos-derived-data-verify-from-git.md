---
id: "1095"
title: Purge macos/.derived-data-verify from git history
type: chore
status: ready
priority: p3
area: general
assigned_to: human
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-11T10:04:28Z"
updated_at: "2026-11-11T12:51:38Z"
---
DONE locally and on GitHub (2026-11-11). Purged macos/.derived-data-verify, macos/.derived-data-verify2, .repoos-check.log and macos/dmg-staging from all history; local refs rewritten (tip trees identical), 35 refs force-pushed to GitHub (main, prod, feat/add-a-go-to-story-link-arrow-on-tasks-an and 32 version tags v0.5.51-v0.5.82).

Backup: ~/repoos-backup-20261111 (mirror, .repoos and worktrees tarballs, dirty-worktree patches, commit-map, refs before/after). Rewrite workspace: ~/repoos-purge-run.

REMAINING (human): (1) GitHub still serves the old commit 5607e2aaa by sha, and refs/pull/1/head still points at the old history; ask GitHub Support to run garbage collection / remove cached views (sensitive data removal request). (2) The leaked credentials must be rotated: Stripe restricted live+test keys (acct_1JO2q2GdsJ8jfw5X; owner unknown) and a 4096-bit RSA private key (SHA256:TFZSc73TwdNPpT4BBBUi6wU8Y4UQytUPGRP28sFa9Ok). (3) 338 old shas in work/ and reports no longer resolve; in-review tasks need a fresh review. (4) Other clones must re-clone or hard-reset. Guard task: #1096.

## Activity

- 2026-11-11T10:04:28Z · created · njachowski@gmail.com
- 2026-11-11T10:20:00Z · status inbox→ready
- 2026-11-11T10:43:59Z · body: Human task (removed)
- 2026-11-11T12:51:38Z · body
