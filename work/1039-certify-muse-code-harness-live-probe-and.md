---
id: 1039
title: "Certify Muse Code harness: live probe and budget allowlist"
type: chore
status: ready
priority: p3
area: core
assigned_to: human
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-05T11:24:57Z"
updated_at: "2026-11-05T13:15:33Z"
---
## Problem

Once the Muse driver (#1038) lands, certification needs Meta credentials, which only the human has.

## Desired UX

Muse is certified and selectable in the budget allowlist.

## Acceptance criteria

- [human] Run `repoos doctor --probe muse --yes` (needs `META_API_KEY` or `muse login`) and watch every seam pass.
- [human] Record the evidence in `src/core/agent-compatibility.json` (`verifiedAt`, `verificationSource`, `newestCertifiedVersion`) and the user-docs table row.
- [human] Add the chosen Muse agent + model pairs to `[[budget.allowlist]]` in `repoos.toml`.

## Notes for AI

Follows the certification workflow in `docs/agent-compatibility.md`. Never set evidence without a real passing run.

## Human task

_Assigned to a human, not an AI agent. No `## Notes for AI` is required here; the acceptance criteria are the human's checklist._

## Activity

- 2026-11-05T11:24:57Z · created · njachowski@gmail.com
- 2026-11-05T13:15:33Z · status inbox→ready
