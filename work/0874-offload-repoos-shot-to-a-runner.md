---
id: "0874"
title: Offload repoos shot to a runner
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Acceptance criteria, Notes for AI"
priority: p3
area: [server, core]
depends_on: ["0854"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-20T12:27:49Z"
updated_at: "2026-10-20T12:27:52Z"
---
Parent #0854 offloads the AUTOMATIC handoff shots and UI verification to a remote runner. Manual `repoos shot` / `repoos verify` deliberately STAY LOCAL: the spec was narrowed in #0854 review pass 17 so the interactive CLI keeps running on the control-plane laptop (no runner-backed repoos shot in #0854). This follow-up designs and implements runner-backed CLI capture: reuse the canonical capture context the control plane already sends (#0854, src/core/remote-capture.ts), the browser-capture policy/fallback rules, and the same structured error contract, so `repoos shot`/`repoos verify` can offload when a runner is available while still falling back locally. Not required for #0854's acceptance criteria; #0864 (real runner image rebuild + end-to-end proof) is separate.

## Activity

- 2026-10-20T12:27:49Z · created · njachowski@gmail.com
- 2026-10-20T12:27:52Z · needs_input
