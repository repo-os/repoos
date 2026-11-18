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
- The fixture-driven mobile cut drawer had no horizontal overflow. The release
  ready, pending, and running pages also had no horizontal overflow at either
  viewport width.

The UI console had no errors during these routes. This pass did not exercise a
completed or failed release cut; doing so would require a terminal run fixture
or a safe server test seam beyond the existing ready, pending, and running
fixtures. Release failure and completion logic remain covered by the existing
release tests.

## Checks

- `checks:progress` on Now showed a running handoff check, progress, local slots,
  and the close-out pipeline.
- `checks:timings` on Runs rendered the timing summary and completed run row;
  `checks:reuse` rendered the reused-check result and skipped-step counts.
- Navigated by clicking Now, Runs, Test suite, and Check plan; each selected tab
  matched its route query. The mobile Now view had no horizontal overflow.
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

No live `release:failed` or `release:done` fixture exists in the current
preview-fixture set. This pass did not create synthetic backend release records
or claim visual coverage for those terminal states. Existing automated tests
continue to cover failure and completion handling.
