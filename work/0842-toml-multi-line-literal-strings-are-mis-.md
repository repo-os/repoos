---
id: "0842"
title: TOML multi-line literal strings (''' ''') are mis-parsed in repoos.toml
type: bug
status: review
needs_input: true
needs_input_reason: review-failed
needs_input_detail: "the cursor agent exited without output: ActionRequiredError: Increase limits for faster responses You're out of usage. Switch to Auto, or ask your admin to increase your limit to continue. ⚠ After this turn ended, 2 process(es) escaped its process group (PIDs: 46168, 46533). They may need manual cleanup."
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/toml-multi-line-literal-strings-are-mis-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-19T05:12:40Z"
updated_at: "2026-10-19T18:01:55Z"
---
## Problem
`repoos.toml` values written as TOML multi-line literal strings (`'''...'''`) are mis-parsed: the stored value keeps literal leading and trailing `''`. Seen on the Dev page for a `[[dev.targets]]` command: `''bun install --frozen-lockfile && ... ''`. It only runs because a shell happens to ignore empty `''`; a command starting with an env assignment (`PORT=3001 bun ...`) failed with `/bin/sh: PORT=3001: command not found`. `'''` and `"""` are valid TOML, so the reader is non-conformant. Found while setting up dev targets for the lightingai project (2026-10-19).

## Desired UX
Any valid TOML string form in `repoos.toml` (basic, literal, multi-line basic `"""`, multi-line literal `'''`) is read exactly as the spec says, in every section (dev.targets, preview.targets, check.steps, agents instructions, etc.). The Dev page and Settings show the real value, with no stray quotes. If a value is genuinely unsupported, config validation says so plainly instead of silently keeping quote characters.

## Acceptance criteria
- Reproduce first: a failing test with a `[[dev.targets]]` row whose `command = '''echo hi && echo there'''` and a `"""..."""` variant, asserting the parsed command equals `echo hi && echo there` (no quotes). Also cover multi-line forms with a leading newline (TOML trims the first newline), embedded single and double quotes, and escapes in `"""` strings.
- Fix the parser (`src/core/config.ts`, `src/core/toml-line.ts`, wherever values are decoded; replace with a conformant parser only if that does not add a runtime dependency, per the zero-runtime-dependency rule, otherwise extend the in-house reader) and keep all existing config tests green.
- A round-trip test: Settings/`repoos config set` writes that touch a row containing `'''` strings must not corrupt or re-quote them (check what the writer does with multi-line strings and fix or document).
- `repoos check` passes. Note the fix in user-docs/configuration.md (supported string forms).
- No UI change expected; if the Dev page display changes, declare `## Shots`.

## Notes for AI
Start from `src/core/config.ts` (dev target parsing near `parseDevTargets`) and `src/core/toml-line.ts`, `src/core/toml-validate.ts`. This is RepoOS itself (self-hosted, zero runtime dependencies): read AGENTS.md. Do not hand-edit any repoos.toml in other repos. A one-line workaround exists (use `"..."` basic strings) but the parser should be fixed.

## Activity

- 2026-10-19T05:12:40Z · created · njachowski@gmail.com
- 2026-10-19T10:22:02Z · status inbox→ready
- 2026-10-19T11:38:14Z · cli_override, model_override
- 2026-10-19T11:38:15Z · model_override
- 2026-10-19T11:38:20Z · status ready→active, branch
- 2026-10-19T17:33:36Z · status active→review
- 2026-10-19T18:01:54Z · note: review pass 1: failed — no usable report
- 2026-10-19T18:01:55Z · needs_input
