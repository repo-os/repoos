---
id: "0734"
title: Block UI handoff and green review when required visual evidence is missing or stale
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Desired UX, Notes for AI"
priority: p1
area: [server, web]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-07T05:39:18Z"
updated_at: "2026-10-07T05:39:56Z"
---
## Problem
Current-main investigation after #0720/#0727/#0733: a shot can show a wrong route, lack its declared target, or contain no feature data and still report a successful handoff. Reviewers sometimes issue good-to-go while explicitly saying visual proof is absent. #0727 saved Mission Control for a Settings claim; #0733 lacked review rows; #0720 reused stale captures after plan changes.

## Verified current implementation
src/server/ui-handoff-gate.ts collects missing highlight/selector matches as warnings and only logs them; they do not enter failing issues. src/server/shot-capture.ts skips when any existing auto shot exists without tying reuse to current plan/HEAD. Captures are stored in the main checkout, but reviewer #0727 looked in the worktree and could not find the PNG. Reviewer prompt asks for inspection but does not enforce a blocking verdict when required visual evidence is unverified. Handoff calls the UI gate after the expensive remote gate (handoff.ts ~552/~615).

## Desired behavior
Use canonical task Shots declarations; resolve actual evidence paths for reviewer. Run a cheap evidence preflight after necessary build but before the full expensive handoff suite. Missing required selector/highlight, wrong final route/login/redirect, or required feature state absent must block with actionable details. Allow explicit optional targets with truthful reasons. Reuse only evidence bound to tested source tree, plan fingerprint and capture result; a metadata note alone should not rerun source tests unnecessarily. Review cannot be good-to-go while a required visual acceptance criterion remains unverified.

## Acceptance criteria
- Regression tests for wrong route, absent required target, stale-plan capture reuse, main-vs-worktree evidence resolution, and reviewer missing-evidence verdict.
- Support meaningful declared assertions (e.g. populated review rows or editable Settings input); generic nonblank screenshot/clean console alone is insufficient.
- Preserve existing browser errors/overflow gates. Do not pretend screenshot assertions establish every semantic requirement; reviewer still checks acceptance.
- Show exact capture URL, matched assertions, tested source/plan identity and failure in task evidence.
- Verify corrected evidence without unnecessarily repeating unchanged full source checks; preserve source/tree check integrity.
- Update scoped docs; normal check/review/server close-out.

## Notes
Follow-up to #0680, source evidence #0720/#0727/#0733 and driver log2026-10-06. Verify current main/build before implementation; these are current local reproductions, not assumed old cross-repo reports. Keep distinct from #0729 runner recovery and #0727 Settings control fix. Do not start unrelated implementation without owner scope.

## Desired UX
Block incomplete required visual evidence before expensive handoff validation; expose exact evidence and source/plan identity. A clean review requires verified visual acceptance, with explicit truthful exceptions.

## Notes for AI
Additional verified cause: handoff.ts constructs uiTask with worktreeTask.body, so canonical-main Shots edits can be ignored when the worktree task copy is stale. Use canonical task declarations without breaking branch source validation. Reviewer PNG resolution must point to actual main checkout storage. Do not implement merely a prompt-only fix or make warnings silently optional. This task is filed, not dispatched; keep runner recovery and current Settings repair moving.

## Activity

- 2026-10-07T05:39:18Z · created · unknown
- 2026-10-07T05:39:19Z · needs_input
- 2026-10-07T05:39:55Z · body: section Desired UX
- 2026-10-07T05:39:56Z · body: section Notes for AI
