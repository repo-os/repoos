---
id: "0692"
title: Resolve integration conflicts without restarting the full engineering and review cycle
type: feature
status: active
priority: p1
area: [server, web]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/resolve-integration-conflicts-without-re
created_at: "2026-10-05T23:52:38Z"
updated_at: "2026-10-07T15:07:47Z"
---
## Problem
Current verified incident: #0730 passed full handoff gate311sbee10:36:36Z and green review10:38:42Z at636a03b27730be914515fff8448cf9028574753f. #0728 then landed1118b2031dbd3346b4f4b91ade9dd8e6585c8ca0. #0730 MTD failed10:44:16Z on src/cli/index.ts conflict and returned active to engineer15482. Original review was valid for its snapshot, but conflict repair restarts engineering/handoff/review, repeats validation, and appears to users as failed development. Driver verified on CURRENT maina1707629aec1e575d5d85e7436b06be67e9dab27 / compiled0.5.67 hash04ce49b2639fa4317ab7fa26abbb304e224903e0a0577f7e7d69dbf1b4061cdc. integration-orchestrator.ts syncCandidate preflight routes named conflicts to onMergeConflict.

## Desired UX
Keep this within server-owned close-out, with visible Resolving integration conflict state and original review evidence tied to its immutable commit. An engineer resolves only the conflict against current main in a server-owned isolated context; no concurrent writers. Review the resolution delta (including surrounding behavior and relevant base changes), rather than repeat whole feature review. Run one required combined gate on the exact resolved candidate. Automatically resume the previously authorized MTD after resolution review and gate pass. If resolution expands scope, changes behavior, cannot be classified confidently, or targeted reviewer finds problems, return to full engineering/review. Do not assume that staying inside conflict hunks proves semantic safety.

## Acceptance criteria
1. Regression modeled on #0728 watch and #0730 decisions/attention CLI additions: resolve command registration conflict, preserve both features and tests, original review immutable, resolution-only review recorded, combined gate once, then normal publication.
2. No prior feature approval/review means no shortcut; behavior-changing resolution or edits outside allowed scope require full handoff/review. Tests demonstrate failures preserve evidence and never auto-publish.
3. Candidate provenance records approved feature SHA, main base SHA, conflict paths, resolution commit/tree, reviewer verdict and gate result. Publication lock checks the exact validated tree; main advancement triggers safe reclassification/revalidation. Dirty worktree, cancellation, server reload and stale generation cannot bypass locks or publish untested edits. Coordinate #0736 cancellation ownership and existing main-drift rules.
4. UI distinguishes conflict repair from new development with phase/reason/progress/timing; CLI/API expose equivalent state and supported actions. Show original feature review separately from pending/passed resolution review. No generic union of docs, tests, lists or code merely because changes look append-only. Restrict deterministic auto-resolution to explicitly allowlisted, tested semantics; preserve existing task-bookkeeping handling.
5. Update AGENTS.md, docs/close-out-pipeline.md and user-docs/review-and-close-out.md for the precise exception. Build, scoped self-check, normal full gate/review/MTD to land this feature. No direct-main commit, manual merge, push, release, config weakening or host changes.

## Notes for AI
Relevance reassessment of existing #0692 opex report: still relevant for genuine code conflict round-trip; partly fixed because #0679 already auto-resumes engineers and #0624 already accepts exact conflict-free merge-tree replay. Old desired UX claiming conflict-region-only edits need no review is superseded: require resolution review and semantic checks above. Earlier incident timing15-30min is historical and not freshly measured. Verify CURRENT main/running build again before implementation; external managed repos used older versions. Record commit/version/reproduction and relevance. Read integration-orchestrator.ts, onMergeConflict wiring, review/handoff lock handling and #0724 gate reuse. #0724 reduces check cost, this task changes lifecycle; avoid duplicate check runs but never skip the combined candidate validation requirement. Keep original historical Activity and task identity; do not create a duplicate task.

## Shots
```json
[
  {
    "label": "Board with integration pipeline bar (now six stages incl. resolve-conflict)",
    "target": "default",
    "route": "/",
    "highlight": ".main"
  }
]
```

## Activity

- 2026-10-05T23:52:38Z · created · unknown
- 2026-10-05T23:52:47Z · story
- 2026-10-07T10:51:15Z · title, priority, area, body
- 2026-10-07T14:35:22Z · status inbox→ready
- 2026-10-07T14:35:45Z · status ready→active, branch
- 2026-10-07T14:54:59Z · body
- 2026-10-07T14:55:58Z · body
- 2026-10-07T14:57:57Z · body
- 2026-10-07T15:00:57Z · body
- 2026-10-07T15:03:58Z · body
- 2026-10-07T15:06:43Z · body
- 2026-10-07T15:07:47Z · body: section Shots
