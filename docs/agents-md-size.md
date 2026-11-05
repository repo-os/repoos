# Keeping AGENTS.md small

`AGENTS.md` is read in full by every agent on every session, and several agents
silently cut it off. Keep it **under 30,000 bytes** (a test enforces this:
`src/core/agents-md-size.test.ts`).

## Why 30 KB

| Agent | Documented behaviour |
| --- | --- |
| Codex | Stops adding project docs at `project_doc_max_bytes`, **32 KiB by default**. Content past it is dropped, reportedly without a warning. ([OpenAI AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md)) |
| Claude Code | Warns when a memory file passes ~40,000 characters; recommends under ~200 lines. (Issue-tracker reports, not an official page.) |
| Muse Code (Meta) | Warned on 2026-11-05 that a 71,849-byte AGENTS.md exceeded its **65,536-byte** startup context limit and would be truncated. |
| Copilot, Cursor, opencode, pi | No documented AGENTS.md cap found (2026-11-05). Community advice clusters around 100–300 lines. |

The tightest confirmed cap is Codex's 32 KiB, so the budget is 30 KB to leave
headroom. When AGENTS.md was ~70 KB, everything after roughly the first 32 KB
(Conventions, Dev login, Debugging, Git setup, "edit the task worktree, not the
checkout your tools start in") was invisible to Codex-based agents.

## What goes where

- `AGENTS.md`: the rule, in a sentence or two, plus a link. Nothing that is
  history.
- `docs/agent-workflow-rules.md`: full text of process rules, close-out and
  check details, incident accounts behind the rules.
- `docs/agent-ui-and-preview-conventions.md`: UI conventions, runtime, tests,
  `repoos shot`, previews, dev login.
- `docs/agent-debugging-and-incidents.md`: worked debugging examples, git setup
  incident, stuck-active incident.

Adding a rule? Add one line to `AGENTS.md` and the detail to a doc above. If the
size test fails, move text out; do not raise the limit without checking the
table above. The `repoos init` template in `src/commands/init.ts` is separate
and is not covered by this budget.
