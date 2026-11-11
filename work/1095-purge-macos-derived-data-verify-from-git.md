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
updated_at: "2026-11-11T10:43:59Z"
---
Commit 5607e2aaa (WIP checkpoint #0892, 2026-10-21) swept 4,763 Xcode build files from macos/.derived-data-verify/ into public history (~271 MB raw, ~160 MB compressed; also reachable from ~19 branches). 

CORRECTION: these files DO contain secrets. Decompressed, the .xcresult blobs include machine-wide diagnostics with a live Stripe restricted key, a test key, and Google API keys (see #1096). A purge removes size and future exposure but does NOT un-leak anything: the human must ROTATE the Stripe live/test restricted keys (ending oiD6 / 9MIs, acct 51JO2q2G...), revoke any live Google key, and clear Raycast clipboard history BEFORE or regardless of the purge. GitHub secret scanning did not flag it (compressed binary).

Overnight prep: a scheduled run (repoos-purge-dryrun-1095) writes /Users/nick/repoos-purge-dryrun/REPORT.md with the branch inventory and a scratch-clone dry run. The real force-push needs the human's go-ahead.

Plan: git filter-repo --path macos/.derived-data-verify --invert-paths, force-push, re-sync task branches/worktrees. Rewrites hashes, so check sha-dependent bookkeeping (review locks) first.

Human-gated: needs a human go-ahead on the force-push.

## Activity

- 2026-11-11T10:04:28Z · created · njachowski@gmail.com
- 2026-11-11T10:20:00Z · status inbox→ready
- 2026-11-11T10:43:59Z · body: Human task (removed)
