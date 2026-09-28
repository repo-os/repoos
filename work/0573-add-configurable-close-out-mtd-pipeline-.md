---
id: "0573"
title: Add configurable close-out (MTD) pipeline timeout
type: feature
status: inbox
priority: p2
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-28T08:39:50Z"
updated_at: "2026-09-28T08:39:50Z"
---
The MTD pipeline (sync→merge→build→check→done) has no hard timeout. A hung remote validation or build step can block indefinitely (observed: >23 minutes on the check step). Add a configurable timeout defaulting to 6 minutes, after which the pipeline aborts cleanly and leaves the task in review with a clear timeout error. Configurable via repoos.toml (e.g. closeOut.timeoutMs).

## Activity

- 2026-09-28T08:39:50Z · created · unknown
