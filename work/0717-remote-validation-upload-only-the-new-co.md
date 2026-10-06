---
id: "0717"
title: "Remote validation: upload only the new commits, not the full-history git bundle, on every run"
type: feature
status: ready
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-06T11:11:30Z"
updated_at: "2026-10-06T11:11:39Z"
---
## Problem

Every remote validation run (close-out, handoff gate, engineer self-check) does `git bundle create candidate.bundle HEAD` (src/server/remote-validation.ts ~1582-1606 and ~3302-3322; bundleRepo at ~1251) and uploads the whole thing over SSH (`cat > ~/.repoos-<task>-<id>.bundle`). The bundle carries the full history (the pack is ~121 MB), and validate.sh does `git clone -q $BUNDLE` (scripts/remote-runner/validate.sh:56). On a good link that is seconds; on flaky wifi it took 9-25 minutes per run on 2026-10-06, caused a 600s close-out timeout (#0709), and EPIPE failures mid-upload (#0709, #0697). Every run pays it again, and a failed upload restarts from zero.

## Desired UX

- A run uploads only what the host does not already have: bundle `<base>..HEAD` where base is a commit the host is known to hold (e.g. the main tip it last fetched), kept as a persistent bare mirror/cache repo on each host (e.g. ~/.repoos-cache/<repo>.git). validate.sh then fetches the small bundle into that mirror and checks out the exact expected sha.
- Fall back to the full bundle only when the host has no mirror or lacks the base (first run, or the host cache was cleared).
- The hard sha verification validate.sh does today stays: the tree under test must be exactly the candidate sha.
- Upload failures are retried with resume or a clear retry, instead of restarting a multi-minute upload from scratch; log the bundle size and upload seconds in the run's events.

## Acceptance criteria

- Tests: bundle for a candidate whose base the host holds contains only the new commits (assert size / ref list); full bundle fallback when the host reports no mirror; sha verification still fails on a mismatched tree.
- The remote-validation event log records bundle bytes and upload seconds.
- Docs updated (docs/remote-validation.md, user-docs/check.md if user-visible). repoos check passes.

## Notes for AI

Read prepareRemoteTestBundle (it already bundles an extra baseSha for test scope), bundleRepo/uploadFile in src/server/remote-validation.ts, and scripts/remote-runner/validate.sh. Keep the container image (repoos-ci) flow working. Do NOT touch .env or the owner's repoos.toml. Evidence for why this matters: field report in this chat/log, overnight-log-2026-10-06.md entries 11:04-11:10.

## Activity

- 2026-10-06T11:11:30Z · created · unknown
- 2026-10-06T11:11:39Z · status inbox→ready
