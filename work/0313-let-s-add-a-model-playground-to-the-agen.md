---
id: "0313"
title: "Let's add a \"Model playground\" to the agents page as a ne…"
type: feature
status: inbox
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: ""
cli_override: claude code
model_override: default
pm_model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
created_at: "2026-08-27T09:54:25Z"
updated_at: "2026-08-27T14:31:36Z"
---
Let's add a "Model playground" to the agents page as a new tab, in the model playground I want to surface new models that might be useful to try out, based on their pricing and abilities.

## Requirements

1. **UI Structure**:
   - Add a new "Model Playground" tab to the agents page
   - Left sidebar showing providers and models worth trying
   - Main panel with chat interface for testing selected models

2. **Data Sources**:
   - Primary: DeepInfra API for model information and pricing
   - Secondary: OpenCode providers with similar data exposure
   - Keep architecture flexible for adding more providers

3. **Model Display**:
   - List models with brief descriptions of why they're worth trying
   - Show pricing: input/output cost per 1M tokens
   - Group by provider when multiple providers are selected

4. **Chat Interface**:
   - Live chat testing with selected model
   - Predefined prompts like "What's this repo about?", "Explain this codebase", etc.
   - Clear indication of which model is currently being tested

5. **Provider Integration**:
   - Start with 2 providers (DeepInfra + one other)
   - Design API abstraction layer for easy provider additions
   - Handle authentication/API key management appropriately

## Implementation Notes

- Focus on clean UI/UX for model discovery and testing
- Consider rate limits and caching strategies for provider APIs
- Ensure security around API key handling
- Make responsive for different screen sizes

## Activity

- 2026-08-27T10:19:33Z · area, body
- 2026-08-27T10:33:06Z · cli_override, model_override
- 2026-08-27T14:31:36Z · status draft→inbox
