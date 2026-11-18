# Inputs and Context pages QA (2026-11)

## Scope and method

Checked Inputs and Repo Context at 1280 × 900 and 375 × 900 CSS pixels using
headless Playwright Chromium against the auth-less server started with
`just serve-noauth 7272` from this task worktree. The pass covered Inputs list
and board modes, an input detail drawer, the New input screenshot picker and
preview, Context Docs/Skills/Discover/History tabs, document refresh, and
simulated failures for the Inputs and docs listing APIs. No input was submitted
and no project document or skill was created.

## Findings and changes

- Inputs previously treated a failed `/api/inputs` request as a successful empty
  result because the store swallowed the error and left its initial list empty.
  Users could be told “No inputs here yet” when the request had failed. The
  refresh method now reports success or failure, and Inputs shows a retryable
  load error in either list or board mode. A successful retry clears the error.
- Context previously rendered “No docs found” while `/api/docs` was still
  loading and after a failed request. The docs store now exposes loading and
  error state. Context shows “Loading docs…” during the request, a retry action
  on failure, and the empty message only after a successful empty response.
- No fit issue appeared at either tested width. The detail drawer and screenshot
  picker remained usable at 375px, and the screenshot preview could be removed
  without submitting the draft.

## Manual QA

At both viewport widths, the Inputs page, board mode, and each Context tab kept
`document.documentElement.scrollWidth` equal to the viewport width. The Context
tabs visited were Docs, Skills, Discover, and History. Existing docs loaded in
the tree and preview, and the tabs changed without page errors. At 375px, an
input opened in the detail drawer, the New input panel accepted a 1 × 1 PNG via
the file picker, displayed its preview, and cleared it from the draft.

For recovery, Playwright returned HTTP 503 for every `/api/inputs` request until
Retry was pressed. Inputs displayed the error instead of the empty-state copy;
after Retry, the request succeeded, the error disappeared, and input rows
returned. The same sequence for `/api/docs` displayed the docs error, then
recovered to the document tree after Retry. The expected browser console
resource errors corresponded to the deliberately simulated 503 responses; no
uncaught page errors occurred. Screenshots from the responsive pass are in the
worktree's ignored `.repoos/qa-1204/` directory.

The review handoff now declares separate Inputs and Context captures at
1280 × 900 and 375 × 812 so the screenshots themselves record the required
desktop and phone widths.

## Regression coverage

The docs-store test covers failure state, loading completion, error clearing
after a successful retry, and overlapping refreshes. A newer docs response now
remains authoritative if an earlier response finishes later; only the current
request controls loading and error state. The Inputs store applies the same
latest-request rule so an older list response cannot replace newer data, and a
superseded failure does not surface as the current refresh's error. Regression
tests cover both out-of-order successes and stale failures. The focused test run
passed 17 tests across the two affected test files and the wrapper's boot-timing
suite. The scoped RepoOS check passed formatting, lint, build, UI guards,
rendered contrast, UI smoke, and the remote changed-path suite (1,705 tests).
