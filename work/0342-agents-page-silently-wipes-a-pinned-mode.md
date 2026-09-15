---
id: "0342"
title: Agents page silently wipes a pinned model when the CLI dropdown is touched
type: bug
status: review
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/agents-page-silently-wipes-a-pinned-mode
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-09-13T15:13:23Z"
updated_at: "2026-09-15T18:37:19Z"
review_rounds: 1
review_passes: 1
dev_error_count: 1
---
Changing an agent's CLI in the Agents page immediately resets that agent's
model to "default" and auto-saves it to repoos.toml — no confirmation, no
undo. A deliberately pinned raw model id (e.g. an opencode id like
`deepinfra/deepseek-ai/DeepSeek-V4-Flash-0731`) is destroyed by a single
dropdown interaction, after which the agent runs the CLI's own raw default
while the page shows "default".

## Where

`src/ui-app/src/components/AgentModelModal.vue` — `selectCli()` emits
`update:model` with `"default"` on any CLI change (line ~67). `AgentsView.vue`'s
`autoSave()` then persists it immediately. Verified still present 2026-09-13.

An existing guard (`if (cli === props.cli) return;`) already prevents the reset
when re-selecting the CLI that's already active, so only genuine CLI switches
trip it.

## Why it matters

Models are pinned on purpose so it's clear which model is actually running;
silently collapsing that to "default" hides it. This instance has several
tunnel-access users, any of whom can trip it, and the loss is invisible —
nothing in the UI says a pin was discarded.

## Possible directions (not prescriptive)

The reset is defensible ONLY when the saved model is genuinely invalid for the
newly selected CLI. Better options:
- Remember a model per CLI, so switching away and back restores the pin.
- Only reset when the saved model isn't valid for the new CLI.
- At minimum, don't auto-save a CLI+model change instantly — or surface that
  the pin was cleared, so it's recoverable.

Whatever the fix, the wider principle: a destructive settings change should
never be silent and instantly persisted.

## Activity

- 2026-09-13T15:13:23Z · created · unknown
- 2026-09-15T18:24:27Z · model_override
- 2026-09-15T18:24:31Z · status inbox→ready
- 2026-09-15T18:24:33Z · status ready→active, branch
- 2026-09-15T18:24:38Z · agent exited with an error (opencode) · error: inference prohibited, please enter a payment method in https://deepinfra.com/dash/billing
- 2026-09-15T18:24:52Z · model_override
- 2026-09-15T18:24:55Z · needs_input
- 2026-09-15T18:29:34Z · status active→review
- 2026-09-15T18:32:07Z · status review→active
- 2026-09-15T18:37:19Z · status active→review
