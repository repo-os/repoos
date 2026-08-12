---
id: "0113"
title: Stop committing dist/ and screenshots/ on feature branches to eliminate merge conflicts
type: chore
status: done
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/stop-committing-dist-and-screenshots-on-
created_at: "2026-08-12T04:40:00Z"
updated_at: "2026-08-12T04:44:33Z"
---
## Problem

Every feature branch commits `dist/` and `screenshots/`, which contain hashed
Vite asset filenames (`index-abc123.js`) and binary PNGs that can never
auto-merge. This causes 90% of merge conflicts when landing tasks to main —
conflicts that are entirely artificial since the done flow rebuilds both
from source on main anyway.

Recent victims: #0080, #0094, #0106, #0104 — every merge needed manual
dist/screenshots conflict resolution.

## Desired UX

- Feature branches contain only source (`src/`, `work/`, `docs/`) and config
  changes. No build artifacts.
- `repoos check` still runs on every feature branch (it builds dist/ locally
  but the agent doesn't commit it).
- Merges to main are clean — no dist/ or screenshots/ conflicts, ever.
- The done flow rebuilds dist/ and regenerates screenshots on main after merge.
- The mission text in agents.ts tells agents not to commit `dist/` or
  `screenshots/`.

## Acceptance criteria

- [ ] The engineer agent mission text (in `src/server/agents.ts`) explicitly
      instructs agents: run `repoos check` to verify, but only commit `src/`,
      `work/`, `docs/`, and config changes — never `dist/` or `screenshots/`.
- [ ] `repoos check` still passes on feature branches (it builds locally,
      just doesn't commit the output).
- [ ] The done flow's build step still regenerates dist/ and screenshots/
      after merge to main.
- [ ] A `git merge` of a feature branch produces zero dist/ or screenshots/
      conflicts (verify by merging a test branch end-to-end).
- [ ] Existing agent behavior is unchanged: they still have a working dist/
      to run `repoos check` against, they just stop committing it.
- [ ] `repoos check` passes.

## Notes for AI

- Do NOT add `dist/` or `screenshots/` to `.gitignore` — they must stay
  tracked on main where `repoos serve` reads from them.
- The change is almost entirely in the mission text in `src/server/agents.ts`
  (the checklist in `missionFor()`). Add one bullet: "Commit only source,
  work, docs, and config files to the branch — never commit dist/ or
  screenshots/."
- Consider also updating the existing checklist step that says "Commit all
  your work on this branch (git add + git commit)" to be more specific.
- Verify by creating a branch, running `repoos check`, committing only src/,
  and confirming a merge to a test branch produces no artifacts conflict.

## Activity

- 2026-08-12T04:10:06Z · status inbox→ready
- 2026-08-12T04:11:49Z · status ready→active, branch
- 2026-08-12T04:26:00Z · implementation verified; handoff blocked because shared Git metadata and the canonical board are outside the agent sandbox
- 2026-08-12T04:38:46Z · status active→review
- 2026-08-12T04:44:33Z · status review→done
