---
id: "1095"
title: Purge macos/.derived-data-verify from git history
type: chore
status: inbox
priority: p3
area: general
assigned_to: human
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-11T10:04:28Z"
updated_at: "2026-11-11T10:04:28Z"
---
Commit 5607e2aaa (WIP checkpoint #0892, 2026-10-21) swept 4,763 Xcode build files from macos/.derived-data-verify/ into public history (~271 MB raw, ~160 MB compressed; also reachable from ~10 task branches). No secrets found (a scanner email claiming a Stripe key was a false positive). .gitignore already covers it going forward (macos/.gitignore: .derived-data-*/).

Do at a quiet moment with no active tasks: git filter-repo --path macos/.derived-data-verify --invert-paths, force-push, then re-sync task branches/worktrees. Rewrites hashes, so plan first: list branches/worktrees affected, how RepoOS task refs/locks cope, and the rollback.

Human-gated: needs a human go-ahead on the force-push.

## Human task

_Assigned to a human, not an AI agent. No `## Notes for AI` is required here; the acceptance criteria are the human's checklist._

## Activity

- 2026-11-11T10:04:28Z · created · njachowski@gmail.com
