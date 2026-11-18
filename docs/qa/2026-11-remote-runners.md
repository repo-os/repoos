# Remote runners and Checks Remote QA — November 2026

## Scope and method

Drove the auth-less app from a detached scratch worktree using `just serve-noauth 7273` and headless Playwright WebKit. Opened `/checks?tab=now` and intercepted the remote-validation status endpoint with a synthetic pool containing a ready runner, a full runner with queued work, an unreachable runner, and a reachable runner whose latest run failed. Repeated the layout pass at 1280×1000 and 375×1000. The data was synthetic; this pass did not claim that any real remote runner was reachable or healthy.

Also aborted the status request in a separate headless page to inspect the fetch error state. No visible browser or user Chrome was opened.

## Findings and changes

Before the fix, a runner using its full concurrency limit still displayed “ready” next to `1/1 in flight`; that headline conflicted with the capacity information. A host with a failed most recent run showed “ready” in the headline and exposed the failure only in “Last completed.” The headline now says “busy” when all slots are occupied and “last run failed” when the latest run failed. Unreachable hosts continue to say “unreachable,” and available idle hosts say “ready.” Unavailability takes precedence over a prior failed run so it does not imply the host can accept work.

The endpoint failure showed the existing actionable message: “Can't reach the RepoOS server — it may be down. Restart it (`repoos serve`), then reload.” The panel had no host rows when the initial status request failed. No change was needed for this path.

## Viewport results

| Viewport | Result |
| --- | --- |
| 1280×1000 | All four synthetic states rendered with the expected headline and detail. Document and body widths were 1280px. |
| 375×1000 | All four synthetic states rendered with the expected headline and detail. Document and body widths were 375px; no horizontal overflow. |

The busy row also retained its active-run and queue details at both widths. The failed row retained its task id, failed result, duration, and timestamp. Browser page errors and console errors: none during the state pass. The aborted request produced the expected error message and no host rows.

## Regression coverage

`src/ui-app/tests/remote-runners-panel.test.ts` now asserts the four headline states and confirms that the busy and failing rows retain their detailed status. The focused test file passed (5 tests). The required changed-path RepoOS check is recorded separately in the task run transcript.
