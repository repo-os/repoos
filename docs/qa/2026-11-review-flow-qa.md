# Review and Move to done flow QA — November 2026

## Scope

Reviewed the task drawer states that frame review and close-out: review readiness, needs-input, active close-out, failed close-out, and landed summary. Responsive targets were 375 px (phone), 768 px (tablet), and 1280 px (desktop). The component fixtures/tests cover the states; a rendered WebKit smoke run also passed, including the existing task drawer check at 360 px. The exact state-by-width matrix was not rendered in this pass.

## State and interaction coverage

| State | Fixture or test coverage | Result |
| --- | --- | --- |
| Review and landing readiness | `drawer:landable`, `drawer:landableNarrow`; `task-drawer-landable.test.ts` | Checklist shows the failing merge check and next step; Move to done is gated while unlandable. The show-all control and allowed landing action have interaction assertions. |
| Needs input | `card:humanStep`, `drawer:held`; `task-drawer-critical-status.test.ts` | Critical needs-input banner remains above the tabs on every tab; review-failed and exhausted-rounds wording is deduplicated and specific. |
| Close-out running | `drawer:closeOutBuilding`, `drawer:closeOutRemoteTests` and narrow variants | Progress state is represented in the drawer; close-out cancellation is available while the pipeline is active. |
| Failed close-out | `card:doneError`; `task-drawer-status-summary.test.ts` | Error is labeled “Close-out failed,” details remain readable, and the failure isn't obscured by a stale needs-input notice. |
| Landed | `drawer:postMergeSummary` | Done task summary fixture is available for capture and shows the post-merge summary. |

## Responsive and reachability review

- At 375 px, the drawer becomes full viewport width; the task header back/close controls and status actions use touch-sized targets, the tab strip wraps to expose all tabs, and the body clips horizontal overflow while retaining vertical scrolling.
- At 768 px, the drawer remains a side panel. The action rows wrap, and the landing checklist's long details and next-step copy wrap within their content column.
- At 1280 px, the drawer retains its resizable side-panel layout and the tab strip stays in its desktop single-row presentation.
- The “Move to done” action is disabled until landing checks pass and while a review, check, handoff, or close-out is in flight. A failed close-out provides the server's detail and retry guidance where available.
- No dead control was found in the existing covered interactions; the show-all checklist toggle and primary close-out submission have test coverage.

## Verification

The focused component suite passed (27 tests across the landing, critical-status, and status-summary files). `bun run build` and `bun run smoke` passed; smoke uses headless WebKit and includes the task drawer at 360 px. `REPOOS_CHECK_CHANGED=main repoos check` passed. RepoOS classified the final diff as documentation-only, so its build, tests, and UI smoke steps were skipped; build and smoke were run separately.

## Limitations

The rendered smoke check did not cover all five drawer states at all three requested widths. It does not claim testing on physical iOS or Android devices. A follow-up state-by-width WebKit matrix would strengthen the responsive geometry evidence.
