---
id: "0604"
title: "Releases modal: tell users notes/cut runs can be left and revisited"
type: chore
status: active
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/releases-modal-tell-users-notes-cut-runs
cli_override: cursor
model_override: composer-2.5
review_model_override: opencode-go/hy3
created_at: "2026-09-30T13:42:54Z"
updated_at: "2026-09-30T19:17:16Z"
---
## Problem
In the Cut a release modal (`src/ui-app/src/views/ReleasesView.vue`) nothing says the user can leave while work continues.

- **Generate with AI**: `POST /api/release/notes` keeps running server-side if the modal closes, and a successful draft is cached (`src/server/release-notes-cache.ts`), so clicking Generate again later returns it instantly. Typical duration 1-3 minutes.
- **Publish**: `POST /api/release` runs detached; state is polled from `GET /api/release/run` on page mount. Typical duration ~5 minutes; safe to navigate away.

## Change
Copy-only. Add hint text: notes drafting takes 1-3 minutes and you can close this and come back (re-clicking Generate reuses the saved draft); the cut takes about 5 minutes and is safe to leave, check status on the Releases page. Keep the existing 'usually takes a few minutes' line consistent with it.

## Out of scope
Server-tracked notes runs (separate task) and notifications (separate task).

## Activity

- 2026-09-30T13:42:54Z · created · unknown
- 2026-09-30T17:53:46Z · cli_override, model_override
- 2026-09-30T17:54:05Z · model_override
- 2026-09-30T17:54:16Z · review_model_override
- 2026-09-30T17:54:19Z · status inbox→ready
- 2026-09-30T17:54:20Z · status ready→active, branch
- 2026-09-30T18:59:16Z · watchdog: auto-surfaced stuck task · status active→review · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-09-30T18:59:16Z · status review→active
- 2026-09-30T19:02:58Z · handoff failed · task-file handoff failed at check · repoos check failed: ⏭ tests  — skipped — test suite ran on the remote validation runner (REPOOS_SKIP_TESTS=1) · ✔ ui-smoke  — ran package.json smoke script · ⏭ user-docs-build  — skipped — no changed path matches user-docs/** · ⏭ landing-build  — skipped — no changed path matches landing/** · ⏭ telegram-manager-build  — skipped — no changed path matches telegram-manager/** · ⏭ telegram-manager-test  — skipped — no changed path matches telegram-manager/** · ⏭ macos-hub-icon-transparency  — skipped — no changed path matches macos/RepoOSHub/Assets.xcassets/**, macos/scripts/generate-app-icons.swift, macos/scripts/verify-dock-icon-transparency.swift, macos/scripts/verify-dock-icon-transparency.sh · 1 check(s) failed.
- 2026-09-30T19:08:16Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · repoos check failed: ⏭ tests  — skipped — test suite ran on the remote validation runner (REPOOS_SKIP_TESTS=1) · ✔ ui-smoke  — ran package.json smoke script · ⏭ user-docs-build  — skipped — no changed path matches user-docs/** · ⏭ landing-build  — skipped — no changed path matches landing/** · ⏭ telegram-manager-build  — skipped — no changed path matches telegram-manager/** · ⏭ telegram-manager-test  — skipped — no changed path matches telegram-manager/** · ⏭ macos-hub-icon-transparency  — skipped — no changed path matches macos/RepoOSHub/Assets.xcassets/**, macos/scripts/generate-app-icons.swift, macos/scripts/verify-dock-icon-transparency.swift, macos/scripts/verify-dock-icon-transparency.sh · 1 check(s) failed. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-09-30T19:08:16Z · status review→active
- 2026-09-30T19:11:55Z · handoff failed · task-file handoff failed at check · repoos check failed: ⏭ tests  — skipped — test suite ran on the remote validation runner (REPOOS_SKIP_TESTS=1) · ✔ ui-smoke  — ran package.json smoke script · ⏭ user-docs-build  — skipped — no changed path matches user-docs/** · ⏭ landing-build  — skipped — no changed path matches landing/** · ⏭ telegram-manager-build  — skipped — no changed path matches telegram-manager/** · ⏭ telegram-manager-test  — skipped — no changed path matches telegram-manager/** · ⏭ macos-hub-icon-transparency  — skipped — no changed path matches macos/RepoOSHub/Assets.xcassets/**, macos/scripts/generate-app-icons.swift, macos/scripts/verify-dock-icon-transparency.swift, macos/scripts/verify-dock-icon-transparency.sh · 1 check(s) failed.
- 2026-09-30T19:17:16Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · repoos check failed: ⏭ tests  — skipped — test suite ran on the remote validation runner (REPOOS_SKIP_TESTS=1) · ✔ ui-smoke  — ran package.json smoke script · ⏭ user-docs-build  — skipped — no changed path matches user-docs/** · ⏭ landing-build  — skipped — no changed path matches landing/** · ⏭ telegram-manager-build  — skipped — no changed path matches telegram-manager/** · ⏭ telegram-manager-test  — skipped — no changed path matches telegram-manager/** · ⏭ macos-hub-icon-transparency  — skipped — no changed path matches macos/RepoOSHub/Assets.xcassets/**, macos/scripts/generate-app-icons.swift, macos/scripts/verify-dock-icon-transparency.swift, macos/scripts/verify-dock-icon-transparency.sh · 1 check(s) failed. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-09-30T19:17:16Z · status review→active
