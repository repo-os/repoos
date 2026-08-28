---
id: "0313"
title: Model playground tab on the agents page
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/model-playground-tab-on-the-agents-page
cli_override: claude code
model_override: sonnet
pm_model_override: deepinfra/zai-org/GLM-5.3-Flash
review_model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
created_at: "2026-08-27T09:54:25Z"
updated_at: "2026-08-28T14:32:19Z"
review_passes: 2
---
Add a "Model playground" tab to the agents page: a place to discover models worth trying out and chat-test them live.

## Layout

- Left sidebar: list of models worth trying, grouped by provider, with a one-line reason why each is worth trying, pricing (input/output per 1M tokens), and context window size where available.
- Right panel: chat screen for the selected model, with canned starter prompts (e.g. "What's this repo about?", "Explain this codebase") and a clear indication of which model is active.

## Data sources

- DeepInfra API for model info and pricing.
- OpenRouter `GET https://openrouter.ai/api/v1/models` (open endpoint, no auth) for pricing + context window data.
- Two providers to start; add a small provider abstraction so more can be added later (e.g. other opencode providers that expose pricing).

## Notes

- Architecture should make adding providers cheap; keep provider-specific quirks behind the abstraction.
- Cache/rate-limit-aware fetching of provider data.
- Keep API key handling out of the client where possible.
- Responsive layout for smaller screens.

## Activity

- 2026-08-27T14:35:13Z · title, body
- 2026-08-28T10:10:55Z · review_model_override
- 2026-08-28T10:11:04Z · status ready→active, branch
- 2026-08-28T10:23:43Z · status active→review
- 2026-08-28T13:56:09Z · status review→active
- 2026-08-28T13:56:09Z · note: Something's wrong with the html of the model list, it's not showing, just some html snippet is there. also see the suggestions from the reviewer and try to implement them.
- 2026-08-28T14:19:26Z · status active→review
- 2026-08-28T14:32:18Z · status review→active
- 2026-08-28T14:32:18Z · note: UI still has a bug, it's showing this instead of a list of models: ```Unexpected token '<', "<!DOCTYPE "... is not valid JSON```
