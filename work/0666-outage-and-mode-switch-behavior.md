---
id: "0666"
title: Outage and mode-switch behavior
type: feature
status: inbox
priority: p1
area: server
story: Cloud attachment storage
depends_on: ["0660", "0663"]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T08:29:35Z"
updated_at: "2026-10-05T12:05:06Z"
---
## Problem
When Neon (cloud storage provider) is unavailable — network outage, provider down, or mode switched off — attachment reads and writes must degrade gracefully. The current behavior isn't defined: it could lose the task record (Markdown reference broken), delete the local original, or claim an upload succeeded when it didn't. This slice ensures outage behavior is explicit: the local original stays intact, the Markdown reference remains resolvable, and upload state shows "pending" rather than false success or lost data.

## Desired UX
- When Neon is unreachable, reading an attachment falls back to the local original file (if present); no broken links or missing-file errors shown to the user.
- The attachment's upload state in the UI reads "upload pending" (not "available"), making it visible that cloud sync hasn't completed.
- The local original file is never deleted by outage logic; deletion is only allowed after verified upload (per slice 6 / 0663).
- Mode switch (local ↔ cloud) does not corrupt or drop the Markdown reference; the reference format (0661) stays stable.
- No unproven offline-access claims appear in docs or UI; retrieval requires the owning RepoOS server or the local file, clearly stated.

## Acceptance criteria
- [ ] With Neon unreachable: reading a cloud-referenced attachment serves the local original (if present) without error; the task Markdown record is intact.
- [ ] Upload state UI shows "pending" (not "success" or "available") while Neon is down and upload hasn't been verified.
- [ ] Local original file is never deleted by outage or mode-switch logic; retention/deletion only follows verification rules (see 0665).
- [ ] Mode switch (local/cloud) does not break the reference resolver; same Markdown resolves before and after switch.
- [ ] A negative test proves: removing the local-fallback check causes a test failure when Neon is simulated down.
- [ ] No docs/UI claim offline retrieval or remote access without server; if no such claim exists, docs say plainly what retrieval requires.
- [ ] Zero new runtime dependencies unless explicitly authorized by a separate task decision.

## Notes for AI
- Depends on 0660 (Neon provider) and 0663 (migration flow) because the fallback assumes a provider interface and verified-upload lifecycle exist.
- Reference resolver (0661) must stay intact during outage; do not change reference format here.
- Do not implement a hosted authorization service or remote-access broker in this slice; that decision lives in 0667.
- The "local original still here, upload pending" state is the only allowed degraded state; never invent a new state like "offline" or "cached".
- All behavior must be covered by a test that fails if the check is removed (negative-test pattern from the story's acceptance criteria).

## Activity

- 2026-10-05T08:29:35Z · created · unknown
- 2026-10-05T11:15:29Z · needs_input
- 2026-10-05T12:04:18Z · needs_input
- 2026-10-05T12:05:06Z · body
