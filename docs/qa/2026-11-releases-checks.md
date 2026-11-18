# Releases and Checks QA — November 2026

## Setup

Ran `just serve-noauth 7272` from the task worktree and exercised the running
app with Playwright Chromium against its `?shotState=` fixtures. Checked at
1280 px and 375 px widths. No real release was cut or published. The CUA
browser host was unavailable, so this pass used local Playwright instead of
interactive Chrome screenshots.

## Releases

- `release:cutReady`: the ready status showed the current and suggested release,
  distribution destinations, and email panel. Opened the cut drawer and checked
  its version, notes, and publishing guidance at desktop and mobile widths. Did
  not submit the release.
- `release:autoPublishWaiting`: showed the pending “Will publish” status and a
  working Cancel control without publishing.
- `release:cutRunning`: after page load settled, showed “RELEASING…” and progress
  links. On this task branch, the real release status also correctly explained
  that releases must come from main and that working-tree changes block a cut.
- With mocked `/api/release/run` terminal responses layered over the ready
  status fixture, the failed run showed its classified TypeScript failure,
  failed test list, and output; the succeeded run showed the success outcome.
- The fixture-driven mobile cut drawer had no horizontal overflow. The release
  ready, pending, running, failed, and succeeded pages also had no horizontal
  overflow at either viewport width.

The UI console had no errors during these routes. The terminal run states used
mocked API responses, so they verified rendering without initiating a real cut.

## Checks

- `checks:progress` on Now showed a running handoff check, progress, local slots,
  and the close-out pipeline.
- `checks:timings` on Runs rendered the timing summary and completed run row;
  `checks:reuse` rendered the reused-check result and skipped-step counts.
- Mocked `/api/check-runs?limit=300` rows showed both failed and passed
  completed outcomes. Expanding the failed row exposed its failed test detail.
- Navigated by clicking Now, Runs, Test suite, and Check plan; each selected tab
  matched its route query. The mobile Now view had no horizontal overflow.
- The Runs table and expanded failure detail had no horizontal overflow at
  1280 px or 375 px.
- Console errors were absent on the exercised routes.

During inspection, releasing a wedged local check slot still used
`window.confirm()`. Replaced that native prompt with the shared app confirmation
dialog. Its test checks that cancel sends no request and confirm sends exactly
one slot-release request.

## Verification

- `bunx vitest run tests/checks-page-default-tab.test.ts -t 'confirms a wedged'`:
  passed.
- Full scoped RepoOS check is recorded separately by the task handoff gate.

## Coverage boundary

Failed/succeeded release runs and failed/passed Checks history were supplied as
Playwright mocked API responses over the running task-worktree app. No real
release action or backend release record was created.
