---
id: "0591"
title: "Width-aware CLI layout: shared layout helpers, tidy help and doctor"
type: feature
status: review
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/width-aware-cli-layout-shared-layout-hel
review_model_override: opencode-go/mimo-v2.6-flash
created_at: "2026-09-29T23:34:54Z"
updated_at: "2026-09-30T02:11:49Z"
review_rounds: 1
review_passes: 1
---
## Problem
`repoos help` and `repoos doctor` lay text out with fixed `padEnd` columns (`CMD_COL`, `EX_COL`) and never look at the terminal width. Long descriptions wrap back to column 0, breaking the hanging indent (help: doctor/certify/serve/tunnel rows; doctor: long detail lines such as the Cursor/OpenCode compatibility warnings). `doctor` also prints all ~25 passing checks, which buries the one failure.

## Approach
Zero runtime deps, so no chalk/wrap-ansi/cli-table3. Add `src/cli/layout.ts`:
- `visibleWidth(s)` — width ignoring ANSI codes.
- `wrap(text, width, indent)` — ANSI-aware word wrap with hanging indent.
- `termWidth()` — `min(process.stdout.columns ?? 80, 100)`.
- `table(rows, { gap, indent })` — label column + wrapped description column.
- `kv(...)` — label/value table; move the one used by `renderServeBanner` (src/commands/serve.ts) here so serve, status and doctor share it.
Pure functions, unit-tested at fixed widths (60, 80, 140).

## `repoos help`
1. Group commands under headings (e.g. Tasks, Health, Server, Setup); left column is the command name only.
2. Flags move to a dim wrapped line under the description; full usage (`doctor [--json] [--probe <cli>] [--binary <path>]`) moves to a per-command `repoos <cmd> --help`.
3. Trim descriptions to one line where possible (init, doctor).
4. Wrap examples; drop the `# comment` to its own line when it does not fit.

## `repoos doctor`
1. Wrap each detail line at terminal width, indented under its check title.
2. Put the check id on the detail line (or a right-aligned column) so it does not push long titles out.
3. Summary line and Next steps use the same warning-block style as the serve banner; failures listed first.
4. **Collapse passing checks by default**: show only sections with warnings/failures plus the summary, and end with a hint that `--verbose` shows every check. `--json` output is unchanged.

## Acceptance
- No line printed by help or doctor wraps mid-indent at widths 60/80/140 (verify with `COLUMNS`).
- `NO_COLOR` and non-TTY output still work.
- Docs updated: user-docs for `doctor` describe the collapsed output and `--verbose`.

## Activity

- 2026-09-29T23:34:54Z · created · unknown
- 2026-09-30T00:11:06Z · status inbox→ready
- 2026-09-30T00:26:15Z · review_cli_override, review_model_override
- 2026-09-30T00:26:16Z · review_cli_override
- 2026-09-30T00:26:19Z · review_cli_override
- 2026-09-30T00:26:24Z · review_cli_override, review_model_override
- 2026-09-30T00:26:33Z · review_model_override
- 2026-09-30T00:26:33Z · status ready→active, branch
- 2026-09-30T01:52:36Z · status active→review
- 2026-09-30T02:02:27Z · status review→active
- 2026-09-30T02:11:49Z · status active→review
