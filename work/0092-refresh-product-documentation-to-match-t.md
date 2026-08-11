---
id: "0092"
title: Refresh product documentation to match the current implementation
type: chore
status: ready
priority: p2
area: docs
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T14:22:03Z"
updated_at: "2026-08-11T15:42:16Z"
---
## Problem

RepoOS has advanced beyond parts of its product and architecture documentation.
The README and roadmap still describe agent orchestration as a future stage even
though RepoOS can already configure coding agents, run them in task worktrees,
stream their output, resume chats, and move completed work into review. The
architecture document also describes the legacy single-file UI while the active
application is now the Vite + Vue app under `src/ui-app`.

This mismatch makes the project look less mature than it is and gives human and
AI contributors an inaccurate mental model of the current system.

## Desired UX

A reader should be able to open the README, vision, roadmap, concepts, and
architecture documents and get an accurate, mutually consistent explanation of
what RepoOS does today, which parts are still being hardened, and what remains
future work.

This documentation review should eventually run as a recurring maintenance
task so implementation drift is caught regularly. RepoOS does not support
scheduled tasks yet, so this task is a one-time refresh for now. Task #0093
tracks the scheduling capability that could make future documentation audits
recurring.

## Acceptance criteria

- [ ] Audit `README.md`, `docs/vision.md`, `docs/roadmap.md`,
      `docs/concepts.md`, and `docs/architecture.md` against the current source
      tree and completed task history.
- [ ] Update the README and roadmap so agent orchestration is described as a
      current capability, with unfinished hardening work clearly separated from
      features that do not exist yet.
- [ ] Update the architecture document to describe the Vite + Vue application
      under `src/ui-app`; verify that task #0029's completed legacy-UI removal
      is accurately reflected and remove obsolete dual-UI guidance.
- [ ] Reconcile command, endpoint, task-lifecycle, agent, worktree, build, and
      runtime descriptions with the implementation; remove or qualify stale
      claims.
- [ ] Preserve the established product principles: repo-native truth,
      local-first operation, human review, graceful degradation, and zero
      runtime dependencies.
- [ ] Avoid duplicating volatile task-board detail in long-lived documents;
      link readers to `repoos list` or `work/` for live status.
- [ ] Check all internal file references and command examples for accuracy.
- [ ] `repoos check` passes after the documentation changes.

## Notes for AI

- Treat `work/*.md` and the current source as authoritative when status details
  disagree with narrative documentation.
- Do not present partially implemented or active work as complete. Use the task
  board and code to distinguish shipped capabilities from current hardening.
- Keep the documents at their intended levels: vision for durable direction,
  roadmap for the staged arc, architecture for current implementation, and the
  README for the user-facing overview.
- This task updates documentation only. Scheduling or automatically recreating
  the audit belongs to #0093.

## Related

- 0029 — completed removal of the legacy pre-Vite UI
- 0093 — recurring and scheduled tasks on the Agents page

## Activity

- 2026-08-11T14:22:03Z · created · unknown
- 2026-08-11T15:37:46Z · updated · reflect completed legacy-UI removal and prepare the focused docs refresh
- 2026-08-11T15:42:16Z · status inbox→ready
