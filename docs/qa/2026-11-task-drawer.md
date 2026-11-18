# Work board task drawer QA — November 2026

## Scope

Task #1178 covers the Work task drawer at 1280px and 375px, including active,
review, blocked and done states; Changes and logs tabs; and close-out actions.
The intended manual pass uses the auth-less development server and preview
fixtures.

## What I could verify

The repository provides component and fixture tests for the same drawer flows.
I ran these suites with `bun run test --`:

- `mobile-work-queue.test.ts`
- `mobile-task-detail-entry-points.test.ts`
- `task-drawer-landable.test.ts`
- `task-drawer-ui-changes-rows.test.ts`
- `task-drawer-status-summary.test.ts`
- `shot-preview-fixtures.test.ts`

Both passes completed successfully: 164 tests passed across 7 test files in the
wrapper's complete run (the first pass reported 162 tests in 6 UI files; the
second pass included the wrapper's timing suite). Coverage confirms that mobile
queue taps, Search and notice entry points open the shared detail; deep links
select the requested tab; review tasks use the review tab; Changes rows and
sub-tabs render; fixture states are seeded; and close-out is gated by
landability and active check state.

## Browser pass

I started `just serve-noauth` from this worktree. It built the app and reported
`http://127.0.0.1:7272`. The Work route opened preview fixtures without a
sign-in prompt. The startup output included `Preview auth.enabled`, so the
server's auth-disabled configuration was not independently confirmed.

I opened seven drawer fixtures at 1280×900 and 375×900 and waited for the
drawer entrance animation to finish before measuring its bounds:

| Fixture | Drawer state observed | 1280px bounds | 375px bounds |
| --- | --- | --- | --- |
| `drawer:activeRequirements` | Active; Update requirements action visible | x=600, width=680, right=1280 | x=0, width=375, right=375 |
| `drawer:reviewWithBranch` | Review; Move to done visible | x=600, width=680, right=1280 | x=0, width=375, right=375 |
| `drawer:statusReviewFailed` | Review blocked by failed review; retry guidance visible | x=600, width=680, right=1280 | x=0, width=375, right=375 |
| `drawer:held` | Active with Held guidance | x=600, width=680, right=1280 | x=0, width=375, right=375 |
| `drawer:postMergeSummary` | Done; Reopen visible | x=600, width=680, right=1280 | x=0, width=375, right=375 |
| `drawer:closeOutBuilding` | Review; building candidate state | x=600, width=680, right=1280 | x=0, width=375, right=375 |
| `drawer:debugLogs` | Done; Debug/Logs view seeded | x=600, width=680, right=1280 | x=0, width=375, right=375 |

At each width, the Task, PM, Dev, Review, Changes, Tokens and Debug tabs fit
within the viewport. Clicking Changes, Debug and Review selected each tab.
The document scroll width matched the viewport at both widths. The browser run
reported no page or console errors. The tests and fixture run therefore found
no reproducible drawer layout or navigation defect; no product-code change was
needed. No live close-out action was committed or allowed to modify task data.

The first measurement was taken during the 280ms drawer entrance animation and
showed its intentional 40px starting translation. After waiting for the
animation, the drawer aligned exactly with the right viewport edge at both
widths. That initial transient was not a layout defect.

## Findings

The targeted suites and the live fixture pass at both requested viewport
widths found no reproducible drawer bug, so no product-code change was
justified. The focused component tests additionally cover task status
summaries, Changes rows and sub-tabs, review landability, fixture seeding, and
mobile detail entry points.
