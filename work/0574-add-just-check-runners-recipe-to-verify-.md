---
id: "0574"
title: Add just check-runners recipe to verify and clean up runner health
type: feature
status: done
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-28T08:40:08Z"
updated_at: "2026-09-28T11:55:21Z"
---
Add a 'just check-runners' recipe that SSHes to each configured remote validation host and: (1) verifies Docker is running and the repoos-ci image exists, (2) cleans up any stale .repoos-validate.* work dirs left by crashed/killed validate runs (using Docker chown before rm to fix uid 1000 owned files), (3) reports disk space, Docker version, and bun version. Useful for diagnosing MTD failures and proactively clearing stale state. Should work with the pool config (tailscaleHosts) as well as the single-host config.

## Activity

- 2026-09-28T08:40:08Z · created · unknown
- 2026-09-28T11:55:21Z · status inbox→done
