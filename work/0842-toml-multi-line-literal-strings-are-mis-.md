---
id: "0842"
title: TOML multi-line literal strings (''' ''') are mis-parsed in repoos.toml
type: bug
status: done
priority: p2
area: core
merged_commit: c64ab6ab69e92fd9d9f5bf9fa699e7f4f2aff416
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/toml-multi-line-literal-strings-are-mis-
cli_override: pi
model_override: openrouter/deepseek/deepseek-v4.1-flash
review_cli_override: github copilot
review_model_override: default
created_at: "2026-10-19T05:12:40Z"
updated_at: "2026-10-20T17:21:45Z"
last_close_out_gate_ms: 298196
last_close_out_gate_at: "2026-10-19T19:16:58.434Z"
review_passes: 5
review_rounds: 2
dev_error_count: 3
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

## Shots
```json
[
{
"label": "Dev page: [[dev.targets]] commands parsed from repoos.toml",
"target": "default",
"route": "/dev",
"highlight": ".dev-command"
},
{
"label": "Settings repoos.toml tab: supported string forms copy",
"target": "default",
"route": "/settings?tab=toml",
"highlight": ".toml-raw-head .setting-desc"
}
]
```

## Activity

- 2026-10-19T05:12:40Z · created · njachowski@gmail.com
- 2026-10-19T10:22:02Z · status inbox→ready
- 2026-10-19T11:38:14Z · cli_override, model_override
- 2026-10-19T11:38:15Z · model_override
- 2026-10-19T11:38:20Z · status ready→active, branch
- 2026-10-19T11:38:36Z · review_cli_override, review_model_override
- 2026-10-19T11:38:39Z · agent exited with an error (cursor) · ActionRequiredError: Increase limits for faster responses You're out of usage. Switch to Auto, or ask your admin to increase your limit to continue.
- 2026-10-19T12:19:42Z · cli_override, model_override
- 2026-10-19T12:19:45Z · model_override
- 2026-10-19T12:28:49Z · body
- 2026-10-19T12:29:37Z · body
- 2026-10-19T12:40:06Z · body
- 2026-10-19T12:41:55Z · body
- 2026-10-19T12:50:44Z · handoff failed · remote validation failed: test failure: tests/cli-control-api.test.ts > control API CLI > re-authenticates on 401 via dev backdoor without printing the code, tests/config-docs.test.ts > repoos.toml and environment docs > has an annotated starter repoos.toml that the real parser accepts, tests/toml-line.test.ts > repoos.toml round-trip > loads a # inside an agent's instructions intact on bee — fix it in the feature branch and re-run the gate
- 2026-10-19T14:41:40Z · note: handoff requested (ui-review)
- 2026-10-19T15:06:48Z · cli_override, model_override
- 2026-10-19T15:06:53Z · needs_input
- 2026-10-19T15:08:53Z · cli_override, model_override
- 2026-10-19T15:19:48Z · body
- 2026-10-19T15:26:10Z · message_queued at 2026-10-19T15:26:10.202Z
- 2026-10-19T15:26:10Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-19T15:27:25Z · agent exited with an error (opencode) · ✗ Server finalization stopped at check: remote validation failed: test failure: tests/cli-control-api.test.ts > control API CLI > re-authenticates on 401 via dev backdoor without printing the code, tests/config-docs.test.ts > repoos.toml and environment docs > has an annotated starter repoos.toml that the real parser accepts, tests/toml-line.test.ts > repoos.toml round-trip > loads a # inside an agent's instructions intact on bee — fix it in the feature branch and re-run the gate. The same worktree can be resumed and retried.
- 2026-10-19T15:27:25Z · message_delivered: 1 message(s)
- 2026-10-19T15:27:27Z · note: stopped orphaned engineer pid 97853
- 2026-10-19T17:05:57Z · message_queued at 2026-10-19T17:05:57.982Z
- 2026-10-19T17:05:58Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-19T17:06:39Z · body
- 2026-10-19T17:08:33Z · body
- 2026-10-19T17:15:07Z · body
- 2026-10-19T17:26:09Z · body
- 2026-10-19T17:33:36Z · status active→review
- 2026-10-19T17:35:32Z · note: review pass 1: needs some work
- 2026-10-19T17:35:32Z · message_delivered: 1 message(s)
- 2026-10-19T17:35:33Z · status review→active
- 2026-10-19T17:39:38Z · body
- 2026-10-19T17:47:22Z · status active→review
- 2026-10-19T17:47:22Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (aacc30d9d) during finalization (#0734)
- 2026-10-19T17:47:22Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (aacc30d9d) during finalization (#0734)
- 2026-10-19T17:49:57Z · note: review pass 2: needs some work
- 2026-10-19T17:49:57Z · status review→active
- 2026-10-19T17:52:17Z · body
- 2026-10-19T18:02:04Z · status active→review
- 2026-10-19T18:04:05Z · note: review pass 3: needs some work
- 2026-10-19T18:07:14Z · cli_override, model_override
- 2026-10-19T18:07:15Z · model_override
- 2026-10-19T18:07:18Z · needs_input (dev-error) dismissed by hello@repoos.org
- 2026-10-19T18:07:51Z · status review→active
- 2026-10-19T18:07:51Z · note: Bugs src/core/config.ts:561: .trim() runs before the parser recognizes a multi-line string, removing significant whitespace from its opening line. For example, a valid """first \nsecond""" parses as "first\nsecond"; the validator accepts it. Handoff verification: the only shot is a nonblank / Control-board capture with zero console errors, not the Dev page showing the parsed command. It was captured at a5503144f; reviewed HEAD is 4ba3c8aa8 (the intervening change is task-file-only, but the tree identity differs). It does not verify the visual acceptance criterion. Edge cases None found beyond the whitespace loss above.  Suggestions Declare and capture the Dev route on the final tree so the corrected command display is verified.
- 2026-10-19T18:10:53Z · body
- 2026-10-19T18:14:11Z · body
- 2026-10-19T18:15:05Z · body
- 2026-10-19T18:15:21Z · body
- 2026-10-19T18:16:13Z · body
- 2026-10-19T18:17:01Z · needs_input
- 2026-10-19T18:24:06Z · status active→review
- 2026-10-19T18:27:10Z · note: review pass 4: needs some work
- 2026-10-19T18:27:10Z · needs_input
- 2026-10-19T18:27:10Z · needs_input
- 2026-10-19T18:29:20Z · status review→active
- 2026-10-19T18:29:53Z · needs_input (review-rounds-exhausted) dismissed by hello@repoos.org
- 2026-10-19T18:32:50Z · body
- 2026-10-19T18:37:16Z · body
- 2026-10-19T18:46:25Z · message_queued at 2026-10-19T18:46:25.194Z
- 2026-10-19T18:46:25Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-19T18:57:45Z · body
- 2026-10-19T18:59:27Z · body
- 2026-10-19T19:00:04Z · needs_input
- 2026-10-19T19:07:23Z · status active→review
- 2026-10-19T19:09:46Z · note: review pass 5: needs some work
- 2026-10-19T19:09:46Z · needs_input
- 2026-10-19T19:16:58Z · close-out gate completed in 298s
- 2026-10-19T19:17:12Z · status review→done, release:success
- 2026-10-19T19:46:47Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T04:26:30Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T11:08:21Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T15:31:57Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T16:09:58Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T17:21:45Z · message_overdue: still queued after 60m without being delivered
