---
id: "0109"
title: Stream claude code output as structured events so its Agent tab is not blank
type: bug
status: review
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: feat/stream-claude-code-output-as-structured-
cli_override: opencode
model_override: opencode/big-pickle
created_at: "2026-08-11T20:16:14Z"
updated_at: "2026-08-12T04:13:56Z"
---
## Activity

- 2026-08-11T20:16:14Z · created · unknown


## Problem

The `claude code` driver is the only engine that never asks its CLI for
streaming output (`cliCommand` in `src/server/agents.ts`):

```
opencode   -> --format json
qwen code  -> --output-format stream-json
codex      -> --json
claude     -> (nothing)
```

`claude -p` buffers **all** stdout until the process exits. Nothing reaches
`AgentRunner.onData` until the very end, so a task running on claude code
shows a **completely empty Agent tab for the entire run**, then dumps the
whole transcript at once when it finishes. Observed live on `#0070`, `#0101`
and `#0080` — all three sat blank for their full runs. This is not a UI bug;
no bytes exist to render.

Two knock-on effects:

1. **The stall/telemetry work from 0080 is blind on claude code.** Its
   quiet/may-be-stalled warning keys off `agent.output` arrival, and claude
   code emits nothing until exit — so every claude run looks "quiet" for its
   whole duration.
2. **`extractUsage` (added by 0080) cannot see claude's numbers.**
   `tokensFromObject` reads `obj.usage`, but claude nests it at
   `message.usage` on `assistant` events, and reports authoritative totals on
   a final `result` event. So token/cost counters stay empty for claude code
   even though the CLI reports both precisely.

`session_id` is also still regex-scraped for claude (`SESSION_ID_PATTERNS`)
even though the stream emits it as a real field.

## Desired UX

- A task running on claude code streams into the Agent tab live — assistant
  text, tool calls, and step boundaries — the same way an opencode task does
  today. No more blank panel.
- Token and cost counters populate for claude code runs, sourced from the
  CLI's own reported numbers rather than scraped prose.
- The 0080 stall warning behaves meaningfully on claude code, because real
  output events now arrive during the run.

## Verified CLI behavior (captured live, claude 2.1.220 — do not re-derive)

The flags. `stream-json` **requires** `--verbose` in print mode:

```
claude -p "<mission>" --output-format stream-json --verbose --dangerously-skip-permissions
```

It emits newline-delimited JSON. Real captured event sequence from a run that
read a file:

```
system/init            -> {"type":"system","subtype":"init","session_id":"78dc4e6a-…","model":"claude-sonnet-5",…}
rate_limit_event       -> {"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","utilization":0.25,…}}
system/thinking_tokens
assistant              -> message.content[] = [{"type":"thinking",…}]
assistant              -> message.content[] = [{"type":"tool_use","id":"toolu_013dX…","name":"Read","input":{"file_path":"/private/tmp/ccprobe/sample.txt"},"caller":{"type":"direct"}}]
user                   -> message.content[] = [{"type":"tool_result","tool_use_id":"toolu_013dX…","content":"1\thello world\n2\t"}]
assistant              -> message.content[] = [{"type":"text","text":"Hello world greeting."}]
system/post_turn_summary
result/success         -> {"type":"result","subtype":"success","is_error":false,"num_turns":2,
                           "duration_ms":4677,"total_cost_usd":0.0731223,"result":"Hello world greeting.",
                           "usage":{"input_tokens":4,"output_tokens":91,
                                    "cache_creation_input_tokens":9403,"cache_read_input_tokens":49071,…}}
```

Notes that matter:

- **`result` is the authoritative cost/usage source** — `total_cost_usd` plus
  a complete `usage` block. Prefer it over summing per-message usage.
- Per-`assistant` usage lives at `message.usage`, **not** top-level `usage`.
- `cache_creation_input_tokens` / `cache_read_input_tokens` bill differently
  from `input_tokens`. Do not blindly sum all four into one "tokens" number —
  surface honestly or omit, per 0080's existing "never fabricate" rule.
- A **non-JSON line can appear on stdout**: `Warning: no stdin data received
  in 3s, proceeding without it`. The runner spawns with `stdio[0]="ignore"`,
  so expect this on real runs. The plain-line fallback must swallow it
  without breaking the parse loop.

## Acceptance criteria

- [ ] The claude driver passes `--output-format stream-json --verbose` on
      **both** the first-turn command (`cliCommand`) and the resume command
      (`resumeCommand`) in `src/server/agents.ts`.
- [ ] A claude-specific parser branch maps the events above onto the existing
      `AgentOutputEntry` shapes: `assistant` text -> `text`, `tool_use` ->
      `tool` (name + input), `tool_result` -> that tool entry's output,
      step/summary events -> `step` or `sys`. Unrecognised events and
      non-JSON lines fall back to the existing plain-line path.
- [ ] The session engine is no longer a two-value `"opencode" | "plain"`
      switch that routes claude to the plain path — claude gets its own
      branch in `appendLine` (`session.engine`, set in `start`).
- [ ] `session_id` for claude comes from the `system/init` event, not
      `SESSION_ID_PATTERNS` regex scraping. Resume (`--resume <id>`) still
      works across turns — verify with a real follow-up chat message.
- [ ] `extractUsage` picks up claude's numbers: `message.usage` on assistant
      events, and `total_cost_usd` + `usage` on the terminal `result` event.
      Cache-token fields are handled deliberately (documented choice), never
      silently summed into the headline token count.
- [ ] Fixture tests in `src/ui-app/tests/agent-drivers.test.ts` assert the new
      flags on first turn and resume; parser unit tests cover each event shape
      above **using the captured payloads in this task file**, including the
      non-JSON warning line falling back cleanly.
- [ ] Verified with a **real** claude code agent turn against a running
      server — not only unit tests: confirm the Agent tab fills in live during
      the run, and that token/cost counters populate.
- [ ] `repoos check` passes.

## Notes for AI

- Files: `src/server/agents.ts` (`cliCommand`, `resumeCommand`,
  `parseJsonEvent` or a new `parseClaudeEvent`, `isOpenCode`/`session.engine`,
  `appendLine`, `extractUsage`/`tokensFromObject`/`costFromObject`), plus the
  two test files above.
- **Do not regress opencode.** `parseJsonEvent` is opencode's parser and its
  event names (`text`/`tool_use`/`step_start`/`step_finish`) collide
  conceptually with claude's but have different shapes — claude nests under
  `message.content[]`, opencode under `part`. Keep them as separate branches
  rather than one merged parser trying to sniff both.
- `--dangerously-skip-permissions` must stay. It is load-bearing: stdin is
  ignored, so an approval prompt can never be answered and the agent hangs
  forever without it. There is a regression test asserting this — do not
  remove it while editing the same argv.
- Reuse 0080's `extractUsage` rather than adding a parallel usage path; this
  task extends it, not replaces it.
- Assumption to state if you diverge: `result.total_cost_usd` is cumulative
  for the whole turn, so it should **replace** the running cost figure for
  that turn rather than being added to it.
- Verify the UI via the managed preview workflow (0096):
  `curl -s -X POST "$REPOOS_API_URL/api/tasks/$REPOOS_TASK_ID/preview"` and
  probe the returned `url`. Do not run `repoos serve` yourself or pick a port.

## Scope

- Covers: claude code streaming flags, its event parser, session-id capture
  from the stream, and usage/cost extraction for claude.
- Deferred: any change to the opencode/qwen/codex drivers, the Agent tab's
  visual design (0080 owns it), and persisting transcripts (0090 owns it).

## Related

- 0080 · Agent run telemetry / stall warning — done; built `extractUsage` and
  the stall UI this fix makes functional on claude code. The streaming fix was
  reported to its agent 19s after it had already set `review`, so it never
  landed there — hence this task.
- 0045 · Structured opencode output — the parser pattern to follow.
- 0090 · Persist agent transcripts — adjacent; don't overlap.

## Activity

- 2026-08-11T20:18:23Z · status inbox→ready
- 2026-08-11T20:19:02Z · model_override
- 2026-08-11T20:19:12Z · status ready→active, branch
- 2026-08-12T04:13:52Z · cli_override
