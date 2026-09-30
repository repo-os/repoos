---
id: "0603"
title: "Automatic shots: skip non-UI diffs, caption why, support highlights"
type: bug
status: active
priority: p2
area: [server, web]
assigned_to: ai
created_by: ""
branch: feat/automatic-shots-skip-non-ui-diffs-captio
review_model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-30T13:19:31Z"
updated_at: "2026-09-30T19:43:02Z"
---
## Problem

Automatic shot capture at handoff (#0594) produces screenshots that show nothing about the change. Seen on #0599 and #0600 (both non-UI):

- #0599 (init.ts, a test, a 3-line docs wording edit): got a "Docs site" shot of the docs home page at `/` and a "default" shot of the dashboard at `/`. Neither relates to the diff.
- #0600 (diff = one `work/*.md` task file only): still got a "default" shot of `/`. That diff matches no target's `[[preview.paths]]`, so the fallback (likely the default `[preview] command` in `src/server/preview.ts`) fired when no path resolved. Confirm root cause.
- Neither task declared `## Shots`, so both are pure `/` fallback captures, and the fallback records no `label`. The Changes tab gives the reviewer no hint what a shot is meant to show.

## Scope (one task)

1. **Skip non-UI diffs.** With no declared `## Shots`, the automatic capture must not shoot unless the diff touches a target's `paths`. A `work/*.md`-only or server/CLI-only diff records a visible `shots: skipped — no UI change to capture`. Fix the default-fallback path that shot #0600.
2. **Docs targets need a declared route.** `user-docs/**` matching alone must not produce a `/` shot of the docs home page. Docs shots require a declared route (the page that changed), or are skipped with a visible note.
3. **Caption every shot with why it exists.** Record and render provenance in the Changes tab and `shots.json`: "declared: <label>" for engineer-declared shots, or "auto: matched <glob>" for fallback shots. The fallback must always set a label.
4. **Optional highlight.** Extend the `## Shots` schema (`core/shot-plan.ts`) with an optional `highlight` CSS selector. Before capture (`core/shot-page.ts`) draw an outline around the matched element(s) and remove it afterwards. Update engineer handoff guidance/prompt so declared shots say what changed and highlight it where possible. Fallback shots cannot highlight (no way to know the changed element).

## Notes

- Update docs touched by the change (`docs/`, `user-docs/`, `AGENTS.md` Shots bullet if it contradicts).
- Tests: `shot-plan.test.ts` plus capture/skip cases. Any new config key needs a Settings UI control per AGENTS.md.
- Rebuild the UI after the change.

## Activity

- 2026-09-30T13:19:31Z · created · unknown
- 2026-09-30T17:53:21Z · review_model_override
- 2026-09-30T17:53:21Z · status inbox→ready
- 2026-09-30T17:53:23Z · status ready→active, branch
- 2026-09-30T19:33:02Z · watchdog: auto-surfaced stuck task · status active→review · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-09-30T19:33:02Z · status review→active
- 2026-09-30T19:37:13Z · handoff failed · task-file handoff failed at check · repoos check failed: - rendering pages... · [32m✓[0m rendering pages... · build complete in 3.75s. · ⏭ landing-build  — skipped — no changed path matches landing/** · ⏭ telegram-manager-build  — skipped — no changed path matches telegram-manager/** · ⏭ telegram-manager-test  — skipped — no changed path matches telegram-manager/** · ⏭ macos-hub-icon-transparency  — skipped — no changed path matches macos/RepoOSHub/Assets.xcassets/**, macos/scripts/generate-app-icons.swift, macos/scripts/verify-dock-icon-transparency.swift, macos/scripts/verify-dock-icon-transparency.sh · 1 check(s) failed.
- 2026-09-30T19:43:02Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · repoos check failed: - rendering pages... · [32m✓[0m rendering pages... · build complete in 3.75s. · ⏭ landing-build  — skipped — no changed path matches landing/** · ⏭ telegram-manager-build  — skipped — no changed path matches telegram-manager/** · ⏭ telegram-manager-test  — skipped — no changed path matches telegram-manager/** · ⏭ macos-hub-icon-transparency  — skipped — no changed path matches macos/RepoOSHub/Assets.xcassets/**, macos/scripts/generate-app-icons.swift, macos/scripts/verify-dock-icon-transparency.swift, macos/scripts/verify-dock-icon-transparency.sh · 1 check(s) failed. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-09-30T19:43:02Z · status review→active
