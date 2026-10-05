---
id: "0664"
title: Upload state + retry UX
type: feature
status: inbox
needs_input: true
questions: ["1. Retry endpoint: same or dedicated? 2. Auto-retry once? 3. Max retry count?"]
priority: p1
area: ui
story: Cloud attachment storage
depends_on: ["0660"]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T08:29:24Z"
updated_at: "2026-10-05T09:16:46Z"
---
Slice 7: Uploading / retrying / failed states visible in UI. Attachment never shown as available before upload succeeds. Retry without re-deriving user input.

## Acceptance criteria
- [ ] Uploading state: attachment card shows spinner/progress; file not listed as "available".
- [ ] Failed state: card shows retry action; error visible; file remains selected.
- [ ] Retry: re-submits same file/user input without re-deriving input.
- [ ] Success: only after server-confirmed upload is attachment listed as available.
- [ ] Covers upload targets (screenshots / inputs / attachments).

## Scope
Slice 7 of cloud attachment storage (depends_on: 0660). Purely UI/UX state rendering + retry flow.

## Questions for human
1. Retry endpoint: same upload endpoint or dedicated retry endpoint?
2. Auto-retry once before showing failed state?
3. Max retry count enforced in UI?

## Activity

- 2026-10-05T08:29:24Z · created · unknown
- 2026-10-05T09:16:46Z · needs_input, questions, body
