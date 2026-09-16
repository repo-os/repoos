---
id: "0368"
title: "Investigate and (if feasible) build structured elicitation: clickable multi-choice questions from an agent, not just chat"
type: feature
status: inbox
priority: p3
area: agent
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-16T05:39:12Z"
updated_at: "2026-09-16T05:39:12Z"
---
## Problem

Claude Code, Codex, and (per the user) opencode's own interactive mode
surface structured questions mid-turn: a prompt, a set of clickable options,
and a free-text "Other" escape hatch — faster and less ambiguous than an
agent asking in prose and the human typing a reply. RepoOS has no equivalent
today: every per-task agent chat (the PM tab, the engineer tab) is plain
text in, plain text out.

This came up designing #0364 (onboarding tasks that need the PM agent to
interview the human about stack/scope/priorities) — that task does NOT
depend on this one. Plain-text Q&A in the PM chat already works end to end
today (`AgentRunner.send()` delivers a human reply back into a resumable
agent session, the same mechanism `review.ts`'s auto-bounce already uses).
This task is about the nicer UX, valuable well beyond onboarding — any
PM/engineer decision point could use structured choices — so it's scoped
separately rather than blocking #0364.

## Investigate before building anything

The real unknown, and the thing that determines whether this is buildable at
all, is layer one: **does any driven CLI's machine-readable output format
already carry a structured "ask with choices" event?** Check each of the six
drivers RepoOS actually spawns (`docs/agent-model-recommendations.md` has the
current per-CLI capability matrix as a starting point, but verify against
the live protocol, don't trust a doc that might itself be stale):

- **opencode** (`--format json`) — the user specifically named this one as
  having equivalent behavior in its own interactive mode. Confirm what its
  structured JSON stream actually emits for a clarifying-question moment
  (a distinct event type? a generic tool-call the built-in interactive UI
  happens to render specially, not present in the headless JSON at all?).
- **claude code** (`--output-format stream-json`) — likely has an
  `AskUserQuestion`-shaped tool_use block; confirm the exact shape in
  RepoOS's headless invocation, not just in interactive terminal use.
- **codex** (app-server JSON protocol) — check its capability list/protocol
  docs for an elicitation method.
- **qwen code, github copilot, kiro** — the model-recommendations doc marks
  these as having no machine-parseable output format or unknown capabilities;
  confirm whether that's still true and whether it rules out this feature for
  those drivers specifically (a text-only fallback may be the ceiling for
  some CLIs, and that's fine — see Fallback below).

Do not design the UI or the wire format before this investigation is done —
if zero drivers support it, the honest scope of this task shrinks to
documenting that and closing it, not building unused plumbing.

## If feasible: what needs to exist

Three layers, in dependency order:

1. **Per-driver parsing** that recognizes the CLI's native elicitation event
   (whatever form investigation finds) and normalizes it to one internal
   shape RepoOS controls — a question, a list of options (with an
   `allowFreeform`/"Other" flag), matching the loose shape of this
   conversation's own `AskUserQuestion` tool as a reference, not a spec to
   copy verbatim.
2. **Wire it back**: the agent process is waiting on this answer the same
   way it waits on any stdin turn today — the click needs to become the next
   input to the SAME running session (reuse whatever `AgentRunner.send()` /
   session-resume path already exists; do not build a second, parallel
   send-a-message mechanism).
3. **New chat UI** — a distinct bubble type in the task's chat feed (PM tab,
   engineer tab, wherever an agent can ask) rendering the question and
   clickable options plus a free-text field, sending the choice back through
   step 2's path on click.

## Fallback for CLIs without native support

A driver with no structured elicitation (per the investigation) should keep
working exactly as today — the agent asks in prose, the human replies in
prose in the same chat box. Do not regress plain-text Q&A for any CLI while
adding structured support for others; this is additive, not a replacement
that some drivers get left behind by.

## Acceptance criteria

- [ ] Documented findings, per driven CLI, on whether a structured
      elicitation primitive exists in its headless/machine-readable output,
      with evidence (not inference) for each.
- [ ] If feasible for at least one CLI: that CLI's structured questions
      render as clickable options + free-text in the relevant task chat tab,
      and the human's choice reaches the agent's running session correctly.
- [ ] CLIs without native support are unaffected — plain-text chat Q&A keeps
      working exactly as before.
- [ ] If infeasible for every CLI, the task closes with the investigation
      findings recorded (in this task or linked docs) rather than staying
      open indefinitely or being force-built on a CLI that doesn't actually
      support it.
- [ ] `repoos check` passes.

## Related

- #0364 — the onboarding task that surfaced the need; explicitly does not
  depend on this one and should not be blocked waiting for it.

## Activity

- 2026-09-16T05:39:12Z · created · unknown
