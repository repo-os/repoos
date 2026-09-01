---
id: "0322"
title: Scope orphan-server reaping per repoos instance
type: bug
status: inbox
priority: p2
area: core
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-01T05:07:35Z"
updated_at: "2026-09-01T05:08:59Z"
---
## Problem

Running more than one `repoos` instance at a time (e.g. one per repo) is
currently unsafe: the instances appear to kill each other. The user sees a
"reaped" orphan server message in the terminal and then finds that another
instance's server has been killed. This makes multi-repo workflows impractical
and silently destroys whatever the killed instance was serving (previews,
control plane).

Root cause (to confirm during implementation): the orphan-reaping logic does
not distinguish which `repoos` instance a running server belongs to, so a
second instance's reaper treats the first instance's servers as orphans and
reaps them.

## Desired UX

- Multiple `repoos` instances can run concurrently, one per repo, without
  interfering with each other.
- Reaping is isolated per instance — e.g. scoped by a key like
  `repoos:<repo_name>` — so each instance only ever reaps orphan servers that
  belong to it.
- Starting or stopping one instance never kills another instance's server; a
  "reaped orphan server" message only ever appears for genuinely orphaned
  servers of that same instance.

## Acceptance criteria

- [ ] Two `repoos` instances serving different repos can run simultaneously
      without either killing the other.
- [ ] Orphan reaping only targets servers belonging to the same repo/instance
      (scoped key such as `repoos:<repo_name>`).
- [ ] Single-instance behavior is unchanged: genuine orphans from that
      instance are still reaped, with the same terminal message.
- [ ] A multi-instance test covers start/stop of one instance while another is
      running.
- [ ] `repoos check` passes.

## Notes for AI

- Locate the existing reaping logic first — search the server/core
  process-management code for "reaped" / "orphan" — and confirm the actual
  mechanism (ports, pidfiles, or similar) before designing the fix.
- Assumption: reaping currently uses a namespace (port range, pidfile, or
  lock) shared across instances, so any second instance collides with the
  first. The fix is to make that namespace instance-scoped.
- The user suggested `repoos:<repo_name>` as the scope key. The exact format
  is the implementer's choice, but it must be stable across restarts and
  unique per repo — prefer the repo's resolved absolute path (or a hash of
  it) over the directory basename, so two checkouts with the same folder name
  don't collide.
- Do not weaken single-instance reaping; genuine orphans must still be
  cleaned up.
- Do not change the one-preview-at-a-time policy (#0271) — that cap is per
  control plane and is out of scope here.
- Zero runtime dependencies is a hard constraint.

## Scope

Covers: making orphan reaping instance-scoped so multiple `repoos` instances
coexist.
Deferred: broader multi-instance coordination (shared task registries,
cross-instance UI), changes to the preview cap, and port-allocation changes
beyond what isolation requires.

## Related

- #0271 — one-preview-at-a-time cap (adjacent process-management behavior;
  do not alter here)

## Original prompt

When I have multiple instances of repoos running they seem to be killing each other (I see a "reaped" orphan server message in the terminal sometimes and the server has been killed) -- is there a way we can fix this reaping/killing behaviour to isolate it to each instance of repoos (e.g. repoos:<repo_name>)?

## Activity

- 2026-09-01T05:07:35Z · created · hello@repoos.org
- 2026-09-01T05:08:59Z · status draft→inbox, title, area, type, body
