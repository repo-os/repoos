---
id: "0846"
title: "Hub: read the running-server registry in Add server (scan as fallback)"
type: feature
status: done
priority: p2
area: macos
depends_on: ["0845"]
merged_commit: 7501722be9d6792caab2fd83f55921beb2bfc910
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/hub-read-the-running-server-registry-in-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-19T05:59:53Z"
updated_at: "2026-10-19T08:11:27Z"
last_close_out_gate_ms: 116502
last_close_out_gate_at: "2026-10-19T08:11:22.155Z"
review_passes: 1
---
## Problem
After #0845, every real `repoos serve` writes `~/.repoos/servers/<port>.json`. The Hub's Add server sheet should use it instead of relying on the port scan, so a new local server (for example http://127.0.0.1:7559/) shows up instantly and reliably, on any port.

## Desired UX
- Opening **Add server** lists every registered local server not already added, with project name and `localhost:<port>`; a click fills the URL (same as the existing "Running locally" row).
- Entries are validated before they are shown: pid alive and one `GET /api/health` per entry (parallel, about 1-1.5 s timeout, one retry on timeout); dead or mismatched entries are skipped (and not deleted by the Hub).
- The bounded port scan from #0844 remains as a fallback, run only when the registry directory is missing or empty, and via a small "Scan again" action.
- Registry file contract (written by #0845): `~/.repoos/servers/<port>.json` with `schema, port, host, pid, root, projectName, version, startedAt, kind`.

## Acceptance criteria
- Unit tests (RepoOSHubTests, fake file system and fake health checker): lists valid entries; skips dead pids and health mismatches; excludes already-added ports; ignores malformed or unknown-schema files; falls back to the scan when the directory is empty or missing; shows registry results before scan results.
- Manual check recorded in the task: with a `repoos serve` on a non-default port running, the sheet lists it immediately and a click fills `localhost:<port>`.
- If the Hub is ever sandboxed, reading `~/.repoos/servers` must not crash: it degrades to the scan fallback (note the needed entitlement in the task for the signing work #0577-#0580).
- Documented in macos/README.md.

## Notes for AI
Depends on #0845 for the file format; develop against fixtures of that format and land after it. Start from macos/RepoOSHub/LocalServerDiscovery.swift, ServerEditorSheet.swift and HealthCheckService.swift; coordinate with #0844 (bounded-concurrency scan fix) so the fallback uses its code. Build with xcodebuild and run the Hub unit tests; no device or signing needed. Do not touch repoos.toml. Source: Nick, 2026-10-19.

## Activity

- 2026-10-19T05:59:53Z · created · njachowski@gmail.com
- 2026-10-19T07:51:09Z · status inbox→ready
- 2026-10-19T07:51:13Z · cli_override, model_override
- 2026-10-19T07:51:15Z · status ready→active, branch
- 2026-10-19T07:56:31Z · body
- 2026-10-19T08:05:02Z · status active→review
- 2026-10-19T08:05:03Z · note: shots: skipped — the diff (7 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-19T08:06:02Z · note: review pass 1: good to go
- 2026-10-19T08:11:22Z · close-out gate completed in 117s
- 2026-10-19T08:11:27Z · status review→done, release:success
