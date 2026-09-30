---
id: "0594"
title: "repoos shot: capture the app target for mixed diffs, and let tasks declare which pages/states to shoot"
type: bug
status: active
priority: p2
area: [cli, web]
assigned_to: ai
created_by: ""
branch: feat/repoos-shot-capture-the-app-target-for-m
created_at: "2026-09-30T02:44:14Z"
updated_at: "2026-09-30T04:14:23Z"
---
## Problem

Follow-up to #0582. Investigated 2026-09-30 after no task since #0582 landed produced any shots in the Changes tab. Two causes:

1. **Nobody runs it.** Capture is opt-in for the engineer agent (AGENTS.md: run `repoos shot` once before handoff for UI-visible changes). Nothing on the server triggers it and handoff does not check for it. On #0590 (release modal) the engineer only ran `repoos shot --help`.
2. **Target resolution misses the main app.** Ran `repoos shot` by hand in #0592's worktree (29 changed files, 10+ Vue components plus `style.css`, and one `user-docs/check.md`). It resolved only "Docs site" and screenshotted the docs home page. The default preview target (the main web app) has no `paths` globs, so app files match nothing, and the single docs file was the only match. Mixed diffs get shot as docs/landing only.
3. **It has no idea which page or state to shoot.** `repoos shot` defaults to route `/` and captures the whole page. `<route|url>` and `--selector` exist but are manual flags the engineer must choose. There is no support for reaching a state (open a drawer, click a tab, fill something), so a change inside the task drawer or a modal is not visible from `/`.

## Goal

Shots are captured for every UI-visible task without relying on the agent remembering, from the right target, showing the changed screens.

## Design

- **Default target paths.** Give the default (main app) target `paths` (this repo: `src/ui-app/**`), or treat changed files matching no target's `paths` as belonging to the default target, so a mixed diff captures every matching target. Add a test for a mixed app + docs diff.
- **Server-triggered capture at handoff.** When the task moves to review and the diff touches any target's `paths`, the server runs the capture itself (server-owned preview, same path as `repoos shot`) and records the result. Handoff must not fail because Playwright is missing; record "skipped: <reason>" visibly. Decide whether an engineer-made capture pre-empts the automatic one.
- **Declaring what to shoot.** Add a small declarative shot list the engineer writes and the server reads, e.g. a `## Shots` section or a `shots.json` next to the task, each entry: `target`, `route`, optional `selector`, optional ordered `steps` (click/fill/wait using selectors or test ids) and a label. Keep it stack-agnostic (routes + CSS selectors + simple steps, no Vue knowledge). Without a list, fall back to `/` per matched target. Consider allowing a project-side script hook for states that need real setup (seed data, auth), consistent with "component-level capture stays a project-side script" from #0582.
- The engineer prompt and AGENTS.md should say to write the shot list for UI-visible changes; the reviewer prompt keeps reading whatever exists.
- Any new `repoos.toml` key needs a Settings UI control (or a documented TOML-only exception).

## Acceptance criteria

- [ ] A diff touching app files resolves the default target; a mixed diff resolves every matching target.
- [ ] Moving a UI task to review captures shots server-side without the agent running anything; failure or missing Playwright is recorded as visible "skipped", not a handoff failure.
- [ ] A task can declare routes/selectors/steps to shoot; the captures appear in the Changes tab captioned with target and label.
- [ ] Docs (AGENTS.md, user-docs) updated; tests cover target resolution, the automatic capture path, and the declared-shot parser.

## Activity

- 2026-09-30T02:44:14Z · created · unknown
- 2026-09-30T03:28:15Z · status inbox→ready
- 2026-09-30T03:28:16Z · status ready→active, branch
- 2026-09-30T04:14:23Z · watchdog: auto-surfaced stuck task · status active→review · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-09-30T04:14:23Z · status review→active
