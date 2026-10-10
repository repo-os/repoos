---
id: "0755"
title: "Handoff capture: re-capture the reviewed tree and stop placeholder selectors"
type: bug
status: active
priority: p2
area: [server, ui]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/handoff-capture-re-capture-the-reviewed-
created_at: "2026-10-10T14:10:28Z"
updated_at: "2026-10-10T17:12:59Z"
---
## Problem

The handoff UI capture has failed review on two tasks (#0750 and #0753) for the same reasons:
- The evidence records an older tree than the one reviewed (#0753: evidence for 4266b301b, reviewed HEAD 16620c0f4). The reviewer cannot tell whether the screenshot shows the final change.
- Shot steps target placeholder selectors that are not on the page (for example data-task-id "9999"), so the capture lands on a loading state. The screenshot shows "Loading changes…" with no rows, and the steps time out.
- The shot reports "matches" for a capture that shows nothing useful, because the route matched even though the steps failed.

## Desired UX

- Every handoff capture is taken on the tree that the review and the close-out will use. Evidence for another tree is marked stale and is never shown as verification.
- A shot whose declared steps fail, or that lands on a loading state, is reported as "check", not "matches".
- Declared shots use a route or state fixture that opens the populated view, not click steps on placeholder selectors.

## Acceptance criteria

- [ ] The handoff record stores the tree it captured. The review and the handoff UI section both show that tree, and flag any mismatch with the reviewed HEAD as stale.
- [ ] A capture that finds a loading state, such as "Loading changes…", after its wait is reported as a failed step, not a passing capture.
- [ ] A shot is "matches" only when every declared step succeeded and the expected content is present. Route match alone is not enough.
- [ ] A declared selector that is not on the page is reported as a failed step with its name, so a placeholder cannot slip through.
- [ ] Tests cover a stale tree, a loading-state capture, a missing selector, and a clean populated capture.

## Notes for AI

- The capture and verdict logic is in src/server/ui-handoff-gate.ts and src/ui-app/src/lib/handoff-verification.ts. Reuse the existing step results; do not add a second verdict path.
- The gate must not change handoff gating rules beyond #0743: missing targets stay warnings, but a loading-state capture on a declared shot is a failed step and must show as "check".
- Re-run the handoff capture on the final tree before requesting review.

## Related

- #0753 (the task that surfaced the stale-tree and loading-state capture)
- #0750 (the earlier task with the same placeholder-selector problem)
- #0743 (missing targets are warnings, not failures)

## Activity

- 2026-10-10T14:10:28Z · created · njachowski@gmail.com
- 2026-10-10T14:13:09Z · status inbox→ready
- 2026-10-10T14:13:09Z · status ready→active, branch
- 2026-10-10T15:05:09Z · status active→ready
- 2026-10-10T15:05:10Z · status ready→active
- 2026-10-10T17:11:25Z · body
- 2026-10-10T17:12:26Z · body
- 2026-10-10T17:12:59Z · body
