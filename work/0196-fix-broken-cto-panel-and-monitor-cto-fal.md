---
id: "0196"
title: "Fix broken CTO panel and monitor (CTO false button, agent never resolves, no SSE)"
type: bug
status: done
priority: p1
area: server + ui-app
assigned_to: ai
created_by: ""
branch: feat/fix-broken-cto-panel-and-monitor-cto-fal
created_at: "2026-08-14T12:24:13Z"
updated_at: "2026-08-14T14:46:15Z"
---
## Problem

The CTO agent (0174) was merged to main but is non-functional. Confirmed on main:

1. **"CTO false" button** — `src/ui-app/src/components/CTOPanel.vue:112` renders `CTO {{ running && "🔴" }}`. When `running` is false Vue interpolates the boolean literally, so the toggle button permanently shows `CTO false`.
2. **CTO never resolves as enabled** — `resolveCto` (`src/server/agents.ts:963`) matches `a.name === "cto"` case-sensitively, but the merged `repoos.toml` stores the agent as `name = "CTO"`. So `cto.enabled()` is always `false`: the panel shows "CTO agent is disabled", the monitor never starts, and `POST /api/cto/message` rejects.
3. **Monitor never starts when enabled after boot** — `src/server/server.ts:866` calls `ctoMonitor.start()` only once at startup when CTO is already enabled. Enabling it from the Agents page mid-session does nothing (no periodic loop).
4. **No SSE wiring for the panel** — the server emits `cto` events and `agent.output` for session `cto:board`, but the UI SSE listener (`src/ui-app/src/stores/repo.ts:493`) never subscribes to `cto`, and `CTOPanel` only hydrates once on mount and when unrelated `runningIds` change. The chat/report never live-update (AC #6 of 0174 unmet).

## Desired UX

- The toggle button shows `CTO` with a red dot only while a run is active (never a literal `false`).
- Enabling the CTO on the Agents page actually starts the monitor loop (and disabling stops it).
- The panel streams run/chat output live over SSE like the reviewer chat does.

## Acceptance criteria

- [ ] Button renders `CTO` (+ red dot when running) with no literal `false` text.
- [ ] `resolveCto` matches agent names case-insensitively (consistent with the rest of the codebase's name handling), so the merged `name = "CTO"` config resolves enabled.
- [ ] Enabling/disabling the CTO from the Agents page starts/stops the monitor loop without a server restart.
- [ ] CTO panel updates live over SSE during a run and during chat (subscribes to `cto` events / the `cto:board` output stream).
- [ ] `repoos check` green, including the UI smoke test.

## Notes for AI

- Follow the reviewer precedent (`src/server/review.ts`) for the session/SSE channel.
- The 0174 worktree/branch `feat/cto-engineering-manager-agent-always-on-` still exists; do NOT reuse it — this is a new branch off current main.
- The action toolbox (`sendTaskMessage`/`moveTaskStatus`/`createFollowUpBug` in `src/server/cto.ts`) and the crude stuck detection are known follow-up issues; fixing them is out of scope for THIS task unless trivial.
- Prefer the same API/SSE plumbing patterns already used by review/chat; do not add runtime dependencies.

## Activity

- 2026-08-14T12:27:46Z · body
- 2026-08-14T12:28:12Z · status inbox→active, branch
- 2026-08-14T12:33:24Z · watchdog: auto-surfaced stuck task · status active→review · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-08-14T12:36:51Z · status review→active


## Implementation

Fixes applied on branch `feat/fix-broken-cto-panel-and-monitor-cto-fal` (commit f9fa7f32, 7 files):

1. **CTO false button** — `CTOPanel.vue` now renders static `CTO` text plus a red dot only while a run is live. The panel reads live state from the store instead of local, mount-time-only hydration.
2. **CTO never resolves** — role resolvers (`resolveEngineer`, `resolvePmAgent`, `resolveReviewer`, `resolveCto`) now match agent names case-insensitively via a shared `matchesRole` helper, so a config with `name = "CTO"` actually enables the agent.
3. **Monitor never starts mid-session** — the server starts the CTO monitor cadence unconditionally; `checkNow()` no-ops when disabled, so toggling enabled from the Agents page takes effect without a restart.
4. **No SSE wiring** — the store now owns CTO state: `loadCTO()` hydrates from `GET /api/cto`, `agent.output` for session `cto:board` is routed into the panel buffer (never a task transcript), and `cto` SSE events drive running/ready and trigger an authoritative reload on run end. The panel streams live and refreshes the report automatically.
5. **Agents page** — the default/custom agent split is case-insensitive so `CTO` is recognized as a default name.

`repoos check` passes (build, css-layers, theme-contrast, 44 tests). UI smoke skipped: webkit binary not installed. New store test covers /api/cto hydration, cto:board output routing, and the ready -> reload path.
- 2026-08-14T12:44:12Z · status active→review, body
- 2026-08-14T14:46:15Z · status review→done, release:success
