---
id: "0699"
title: "CLI help drift: generate `repoos new/update --help` from the flag tables; add `--paths` and `--hold` to `repoos new`"
type: feature
status: active
priority: p2
area: cli
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/cli-help-drift-generate-repoos-new-updat
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-06T03:15:49Z"
updated_at: "2026-10-08T14:20:29Z"
dev_error_count: 2
---
## Problem

`repoos new --help` lists `--ai · --type · --area · --priority · --body`, but the command also accepts `--story --depends-on --shots --needs-input --questions`. `repoos update --help` lists eight flags while `UPDATE_FLAGS` accepts ~25 (`--story --depends-on --hold --paths --section --section-body --shots --cli --model --agent --pm-* --review-* --needs-input --needs-merge`). An agent reading `--help` concludes stories and dependencies cannot be set from the CLI. `repoos new` has no `--paths`, so declaring a task's files takes a second command.

## Desired UX

`--help` lists every accepted flag with a one-line description; `repoos new` can set paths and hold in one call.

## Acceptance criteria

- [ ] Help/usage strings for `new` and `update` are generated from `NEW_FLAGS` / `UPDATE_FLAGS` (plus a description map), so adding a flag without help fails a test.
- [ ] `repoos new` accepts `--paths a,b` and `--hold true|false` with the same parsing as `update`.
- [ ] The top-level `repoos --help` Tasks group shows the same flags.
- [ ] `user-docs/cli.md` updated; test asserts every flag in the tables appears in the help output.

## Notes for AI

Evidence: `~/code/tuk/tuk-private/repoos/docs/repoos-feedback.md` (tuk-private run, 2026-10-06), item 6.

## Verify first

Verify first against current main: #0723 (merged) added control-plane CLI commands; check which help text is still hand-written and which flags (--paths, --hold on repoos new) are still missing before changing anything.

## Activity

- 2026-10-06T03:15:49Z · created · unknown
- 2026-10-08T14:06:40Z · body
- 2026-10-08T14:06:57Z · cli_override, model_override
- 2026-10-08T14:07:00Z · status inbox→ready
- 2026-10-08T14:07:01Z · status ready→active, branch
- 2026-10-08T14:07:27Z · agent exited with an error (cursor) · RetriableError: [resource_exhausted] Error
- 2026-10-08T14:10:00Z · needs_input
- 2026-10-08T14:10:28Z · agent exited with an error (cursor) · RetriableError: [resource_exhausted] Error
- 2026-10-08T14:11:55Z · needs_input, cli_override, model_override
- 2026-10-08T14:18:37Z · body
- 2026-10-08T14:20:29Z · body
