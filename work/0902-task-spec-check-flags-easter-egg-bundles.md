---
id: "0902"
title: Task spec check flags easter-egg bundles as underspecified
type: bug
status: ready
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/task-spec-check-flags-easter-egg-bundles
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-21T14:52:31Z"
updated_at: "2026-10-22T01:51:14Z"
dev_error_count: 6
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-22T01:48:07.742Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-22T01:48:09.533Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-22T01:48:11.344Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-10-22T01:48:12.924Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-10-22T01:48:14.671Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-10-22T01:48:16.769Z\",\"kind\":\"dev-error\"}]"
engineer_failover: "{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\"}"
---
## Problem
`assessTaskUnderspecified` (`src/core/task-underspecified.ts`, around line 243) requires top-level `## Problem`, `## Desired UX`, `## Acceptance criteria` and `## Notes for AI` sections, found with `extractSection`. The documented easter-eggs bundle layout (`docs/easter-eggs-bundles.md`, worked example #0822) puts those four as `### ` subsections under each `## E<n> · Title` section, so a correctly formed bundle reads as "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI". The check re-runs on every CLI/API write, so every edit to a bundle (adding an item, changing the title) sets `needs_input: underspecified` again. The task drawer then shows "Not fully fleshed out / Send to PM", which would have the PM agent rewrite a bundle that is already complete. Seen on #0899 on 2026-10-21; #0822's activity log shows the same `needs_input` events.

## Desired UX
- A bundle with `## E<n> · Title` sections, each carrying `### Problem`, `### Desired UX`, `### Acceptance criteria` and `### Notes for AI`, is judged fully specified and is never flagged `underspecified`.
- A bundle whose E-section is missing one of those subsections (or has it empty) is still flagged, naming the item and the missing part (for example `E2: missing Acceptance criteria`).
- Non-bundle tasks behave exactly as today: top-level `## ` sections are still required.
- No manual `--needs-input false` is needed after editing a bundle.

## Acceptance criteria
- Test: a body in the #0822 layout (Items list plus `## E1`/`## E2` with all four `###` subsections) is not underspecified.
- Test: the same body with E2's `### Acceptance criteria` removed is underspecified, with a signal naming E2 and the missing section.
- Test: a plain task with no `## E<n>` sections still reports missing top-level sections as before.
- Test: editing a bundle via `repoos update --section` does not set `needs_input`.
- The PM-agent prompt text built in the same file (around line 314) does not tell the PM to flatten a bundle into top-level sections.
- Docs: `docs/easter-eggs-bundles.md` notes the bundle layout satisfies the spec check; no stale line elsewhere.

## Notes for AI
Start from `assessTaskUnderspecified` and `specSectionHeadingsForTask` in `src/core/task-underspecified.ts`; `extractSection` is in `src/core/task.ts` and only matches `## ` headings. Detect a bundle by the `## E<n> · ` heading pattern (and/or the `Easter eggs bundle:` title) and check each E-section's `###` subsections instead of the top-level ones. Fail closed: only skip the top-level requirement when at least one E-section exists, and still validate every one. Server-side change, so it is not eligible for an easter-egg bundle. Found while filing #0899 (2026-10-21).

## Activity

- 2026-10-21T14:52:31Z · created · njachowski@gmail.com
- 2026-10-22T01:47:20Z · status inbox→ready
- 2026-10-22T01:48:01Z · status ready→active, branch
- 2026-10-22T01:48:07Z · agent exited with an error (opencode) · error: Go usage limit exceeded
- 2026-10-22T01:48:07Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T01:48:09Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T01:48:11Z · engineer crash recovery: switched opencode + opencode-go/deepseek-v4.1-flash → opencode + opencode-go/glm-5.3-flash after 3/3 crashes in 30m · error: Go usage limit exceeded
- 2026-10-22T01:48:12Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T01:48:14Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (2/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T01:48:16Z · engineer crash recovery: surfaced instead of switching — RepoOS already switched this task once (opencode + opencode-go/glm-5.3-flash); it will not chain another automatic switch (3/3 crashes in 30m)
- 2026-10-22T01:50:59Z · cli_override, model_override
- 2026-10-22T01:51:00Z · needs_input
- 2026-10-22T01:51:14Z · status active→ready
