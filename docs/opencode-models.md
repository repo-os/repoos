---
title: OpenCode models — pricing & use cases
---

# OpenCode models — pricing & use cases

This page maps every model currently surfaced by `opencode models` to its
approximate price, its best use, and the RepoOS agent roles it suits. The list
is fetched live from the opencode CLI at research time, so it reflects exactly
what the **Agents → Model** dropdown can show — no stale list.

## Cost tiers

The tier column is a quick read on the price tag (input + output per 1M tokens).

| Tier | Meaning | Example |
| --- | --- | --- |
| 🟢 Free | No token billing | `opencode/big-pickle`, `opencode/deepseek-v4-flash-free` |
| 🟢 Budget | Input under ~$1 / 1M — great default for most work | `opencode/deepseek-v4-flash`, `opencode/gpt-5.6-luna` |
| 🟡 Standard | Input ~$1–4 / 1M — strong all-rounders | `opencode/claude-sonnet-5`, `opencode/gpt-5.4` |
| 🔴 Premium | Input $4+ / 1M — reserve for hard reasoning & review | `opencode/claude-opus-5`, `opencode/gpt-5.5-pro` |

All prices are USD per 1M tokens and come from opencode's own model catalog
(models.dev) — cache pricing is not shown.

## Quick picks by RepoOS role

| Role | Recommended model | Why |
| --- | --- | --- |
| **engineer** | `opencode/deepseek-v4-pro`, `opencode/claude-sonnet-5`, `opencode/gpt-5.5` | Strong coding + tool use at a sane price |
| **reviewer** | `opencode/claude-opus-5`, `opencode/gpt-5.5-pro` | Deepest reasoning for careful review — worth the premium |
| **pm** | `opencode/gpt-5.6-luna`, `opencode/deepseek-v4-flash` | Cheap and fast; plenty for status + roadmap work |
| **RepoOS Guide** | `opencode/big-pickle` (the free default) | Repo Q&A and explanations — no need to pay for frontier |
| **Custom agents** | `opencode/gpt-5.6-luna` or a budget tier | Overrides (task #0064) are best pointed at cheap, fast models |

## All models

Rows marked **—** in the roles column are not suitable for agent use (image,
realtime, or embedding endpoints). Prices are approximations from the opencode
catalog; always treat them as "about this much", not billing-grade.


### Claude (opencode)

| Model | Tier | Input $/1M | Output $/1M | Best for | Recommended roles |
| --- | --- | --- | --- | --- | --- |
| `opencode/claude-fable-5` — Claude Fable 5 | 🔴 Premium | $10 | $50 | Frontier coding model, premium price | reviewer · engineer |
| `opencode/claude-haiku-4-5` — Claude Haiku 4.5 | 🟡 Standard | $1 | $5 | Fast, cheap Claude for everyday tasks | pm · Guide · engineer |
| `opencode/claude-opus-4-5` — Claude Opus 4.5 | 🔴 Premium | $5 | $25 | Top-tier Claude for hard reasoning | reviewer · engineer |
| `opencode/claude-opus-4-6` — Claude Opus 4.6 | 🔴 Premium | $5 | $25 | Top-tier Claude for hard reasoning | reviewer · engineer |
| `opencode/claude-opus-4-7` — Claude Opus 4.7 | 🔴 Premium | $5 | $25 | Top-tier Claude for hard reasoning | reviewer · engineer |
| `opencode/claude-opus-4-8` — Claude Opus 4.8 | 🔴 Premium | $5 | $25 | Top-tier Claude for hard reasoning | reviewer · engineer |
| `opencode/claude-opus-5` — Claude Opus 5 | 🔴 Premium | $5 | $25 | Top-tier Claude for hard reasoning | reviewer · engineer |
| `opencode/claude-sonnet-4` — Claude Sonnet 4 | 🟡 Standard | $3 | $15 | Balanced Claude workhorse | engineer · reviewer · pm |
| `opencode/claude-sonnet-4-5` — Claude Sonnet 4.5 | 🟡 Standard | $3 | $15 | Balanced Claude workhorse | engineer · reviewer · pm |
| `opencode/claude-sonnet-4-6` — Claude Sonnet 4.6 | 🟡 Standard | $3 | $15 | Fast, reliable Claude mid-tier | engineer · pm · reviewer |
| `opencode/claude-sonnet-5` — Claude Sonnet 5 | 🟡 Standard | $2 | $10 | Cheap, strong Claude for coding | engineer · reviewer · pm |

### GPT-5 (opencode)

| Model | Tier | Input $/1M | Output $/1M | Best for | Recommended roles |
| --- | --- | --- | --- | --- | --- |
| `opencode/gpt-5` | 🟡 Standard | $1.07 | $8.5 | General GPT-5 for broad work | engineer · reviewer |
| `opencode/gpt-5-codex` — GPT-5 Codex | 🟡 Standard | $1.07 | $8.5 | Coding-tuned GPT-5 | engineer |
| `opencode/gpt-5-nano` — GPT-5 Nano | 🟢 Budget | $0.05 | $0.4 | Very cheap, small tasks | pm · Guide |
| `opencode/gpt-5.1` | 🟡 Standard | $1.07 | $8.5 | Updated general GPT-5 | engineer · reviewer |
| `opencode/gpt-5.1-codex` — GPT-5.1 Codex | 🟡 Standard | $1.07 | $8.5 | Coding-tuned GPT-5.1 | engineer |
| `opencode/gpt-5.1-codex-max` — GPT-5.1 Codex Max | 🟡 Standard | $1.25 | $10 | Heavier coding reasoning | engineer · reviewer |
| `opencode/gpt-5.1-codex-mini` — GPT-5.1 Codex Mini | 🟢 Budget | $0.25 | $2 | Fast, cheap coding | engineer · pm |
| `opencode/gpt-5.2` | 🟡 Standard | $1.75 | $14 | Updated general GPT-5 | engineer · reviewer |
| `opencode/gpt-5.2-codex` — GPT-5.2 Codex | 🟡 Standard | $1.75 | $14 | Coding-tuned GPT-5.2 | engineer |
| `opencode/gpt-5.3-codex` — GPT-5.3 Codex | 🟡 Standard | $1.75 | $14 | Coding-tuned GPT-5.3 | engineer |
| `opencode/gpt-5.3-codex-spark` — GPT-5.3 Codex Spark | 🟡 Standard | $1.75 | $14 | Fast coding draft | engineer |
| `opencode/gpt-5.4` | 🟡 Standard | $2.5 | $15 | New-gen general model | engineer · reviewer |
| `opencode/gpt-5.4-mini` — GPT-5.4 Mini | 🟢 Budget | $0.75 | $4.5 | Cheap mid-tier GPT-5.4 | engineer · pm |
| `opencode/gpt-5.4-nano` — GPT-5.4 Nano | 🟢 Budget | $0.2 | $1.25 | Cheapest GPT-5.4 | pm · Guide |
| `opencode/gpt-5.4-pro` — GPT-5.4 Pro | 🔴 Premium | $30 | $180 | Heavy reasoning, premium | reviewer · engineer |
| `opencode/gpt-5.5` | 🔴 Premium | $5 | $30 | Frontier general model | engineer · reviewer |
| `opencode/gpt-5.5-pro` — GPT-5.5 Pro | 🔴 Premium | $30 | $180 | Deep-reasoning flagship | reviewer · engineer |
| `opencode/gpt-5.6-luna` — GPT-5.6 Luna | 🟢 Budget | $0.2 | $1.2 | Cheap, fast GPT-5.6 | pm · Guide · engineer |
| `opencode/gpt-5.6-sol` — GPT-5.6 Sol | 🔴 Premium | $5 | $30 | Balanced GPT-5.6 | engineer · reviewer |
| `opencode/gpt-5.6-terra` — GPT-5.6 Terra | 🟡 Standard | $2.5 | $15 | Mid-cost GPT-5.6 | engineer · pm |

### Gemini (opencode)

| Model | Tier | Input $/1M | Output $/1M | Best for | Recommended roles |
| --- | --- | --- | --- | --- | --- |
| `opencode/gemini-3-flash` — Gemini 3 Flash | 🟢 Budget | $0.5 | $3 | Fast, cheap Gemini | engineer · pm |
| `opencode/gemini-3.1-pro` — Gemini 3.1 Pro Preview | 🟡 Standard | $2 | $12 | Strong reasoning Gemini | engineer · reviewer |
| `opencode/gemini-3.5-flash` — Gemini 3.5 Flash | 🟡 Standard | $1.5 | $9 | Fast, balanced Gemini | engineer · pm |
| `opencode/gemini-3.5-flash-lite` — Gemini 3.5 Flash Lite | 🟢 Budget | $0.3 | $2.5 | Cheapest Gemini | pm · Guide |
| `opencode/gemini-3.6-flash` — Gemini 3.6 Flash | 🟡 Standard | $1.5 | $7.5 | Latest fast Gemini | engineer · pm |

### DeepSeek (opencode)

| Model | Tier | Input $/1M | Output $/1M | Best for | Recommended roles |
| --- | --- | --- | --- | --- | --- |
| `opencode/deepseek-v4-flash` — DeepSeek V4 Flash | 🟢 Budget | $0.14 | $0.28 | Very cheap, strong coder | engineer · pm · Guide |
| `opencode/deepseek-v4-flash-free` — DeepSeek V4 Flash Free | 🟢 Free | free | free | Free tier coder | pm · Guide · engineer |
| `opencode/deepseek-v4-pro` — DeepSeek V4 Pro | 🟡 Standard | $1.74 | $3.84 | Strong reasoning coder, low cost | engineer · reviewer |

### Other models (opencode)

| Model | Tier | Input $/1M | Output $/1M | Best for | Recommended roles |
| --- | --- | --- | --- | --- | --- |
| `opencode/big-pickle` — Big Pickle | 🟢 Free | free | free | Free all-in-one default; fine for most work | Guide · engineer · pm |
| `opencode/glm-5` | 🟡 Standard | $1 | $3.2 | Mid-cost general coder | engineer · pm |
| `opencode/glm-5.1` | 🟡 Standard | $1.4 | $4.4 | Mid-cost general coder | engineer · pm |
| `opencode/glm-5.2` | 🟡 Standard | $1.4 | $4.4 | Mid-cost general coder, big context | engineer · pm |
| `opencode/grok-4.5` — Grok 4.5 | 🟡 Standard | $2 | $6 | Strong all-rounder, huge context | engineer · reviewer |
| `opencode/grok-build-0.1` — Grok Build 0.1 | 🟡 Standard | $1 | $2 | Coding-focused Grok | engineer |
| `opencode/hy3-free` — Hy3 Free | 🟢 Free | free | free | Free budget model | pm · Guide · engineer |
| `opencode/kimi-k2.5` — Kimi K2.5 | 🟢 Budget | $0.6 | $3 | Cheap general model | engineer · pm |
| `opencode/kimi-k2.6` — Kimi K2.6 | 🟢 Budget | $0.95 | $4 | Balanced general model | engineer · pm |
| `opencode/kimi-k2.7-code` — Kimi K2.7 Code | 🟢 Budget | $0.95 | $4 | Coding-tuned Kimi | engineer |
| `opencode/kimi-k3` — Kimi K3 | 🟡 Standard | $3 | $15 | Premium reasoning | engineer · reviewer |
| `opencode/laguna-s-2.1-free` — Laguna S 2.1 Free | 🟢 Free | free | free | Free budget model | pm · Guide |
| `opencode/ling-3.0-tiny-free` — Ling-3.0-tiny Free | 🟢 Free | free | free | Free tiny model | pm · Guide |
| `opencode/mimo-v2.5-free` — MiMo V2.5 Free | 🟢 Free | free | free | Free budget model | pm · Guide · engineer |
| `opencode/minimax-m2.5` | 🟢 Budget | $0.3 | $1.2 | Cheap mid coder | engineer · pm |
| `opencode/minimax-m2.7` | 🟢 Budget | $0.3 | $1.2 | Cheap mid coder | engineer · pm |
| `opencode/minimax-m3` | 🟢 Budget | $0.3 | $1.2 | Balanced mid coder | engineer · pm |
| `opencode/nemotron-3-ultra-free` — Nemotron 3 Ultra Free | 🟢 Free | free | free | Free, big context | pm · Guide · engineer |
| `opencode/nemotron-3.5-lightning-free` — Nemotron 3.5 Lightning Free | 🟢 Free | free | free | Free, fast | pm · Guide · engineer |
| `opencode/qwen3.5-plus` — Qwen3.5 Plus | 🟢 Budget | $0.2 | $1.2 | Cheap, strong coder | engineer · pm |
| `opencode/qwen3.6-plus` — Qwen3.6 Plus | 🟢 Budget | $0.5 | $3 | Cheap, strong coder | engineer · pm |

### opencode-go — reduced-price gateway

| Model | Tier | Input $/1M | Output $/1M | Best for | Recommended roles |
| --- | --- | --- | --- | --- | --- |
| `opencode-go/deepseek-v4-flash` — DeepSeek V4 Flash (2x usage) | 🟢 Budget | $0.07 | $0.14 | Cheap coder at reduced price | engineer · pm · Guide |
| `opencode-go/deepseek-v4-pro` — DeepSeek V4 Pro | 🟢 Budget | $0.435 | $0.87 | Strong reasoning coder | engineer · reviewer |
| `opencode-go/glm-5.1` | 🟡 Standard | $1.4 | $4.4 | Mid-cost general coder | engineer · pm |
| `opencode-go/glm-5.2` | 🟡 Standard | $1.4 | $4.4 | Mid-cost general coder | engineer · pm |
| `opencode-go/gpt-5.6-luna` — GPT-5.6 Luna (2x usage) | 🟢 Budget | $0.1 | $0.6 | Cheap, fast GPT-5.6 | pm · Guide · engineer |
| `opencode-go/grok-4.5` — Grok 4.5 | 🟡 Standard | $2 | $6 | Strong all-rounder | engineer · reviewer |
| `opencode-go/hy3` | 🟢 Budget | $0.14 | $0.58 | Budget light coder | pm · Guide · engineer |
| `opencode-go/kimi-k2.6` — Kimi K2.6 | 🟢 Budget | $0.95 | $4 | Balanced general model | engineer · pm |
| `opencode-go/kimi-k2.7-code` — Kimi K2.7 Code | 🟢 Budget | $0.95 | $4 | Coding-tuned Kimi | engineer |
| `opencode-go/kimi-k3` — Kimi K3 | 🟡 Standard | $3 | $15 | Premium reasoning | engineer · reviewer |
| `opencode-go/mimo-v2.5` — MiMo V2.5 | 🟢 Budget | $0.14 | $0.28 | Budget coder | pm · Guide · engineer |
| `opencode-go/mimo-v2.5-pro` — MiMo V2.5 Pro | 🟢 Budget | $0.435 | $0.87 | Budget pro coder | engineer · pm |
| `opencode-go/minimax-m2.7` | 🟢 Budget | $0.3 | $1.2 | Cheap mid coder | engineer · pm |
| `opencode-go/minimax-m3` | 🟢 Budget | $0.3 | $1.2 | Balanced mid coder | engineer · pm |
| `opencode-go/qwen3.6-plus` — Qwen3.6 Plus | 🟢 Budget | $0.5 | $3 | Cheap, strong coder | engineer · pm |
| `opencode-go/qwen3.7-max` — Qwen3.7 Max | 🟡 Standard | $2.5 | $7.5 | Premium Qwen reasoning | engineer · reviewer |
| `opencode-go/qwen3.7-plus` — Qwen3.7 Plus | 🟢 Budget | $0.4 | $1.6 | Cheap, strong coder | engineer · pm |
| `opencode-go/qwen3.8-max` — Qwen3.8 Max | 🟡 Standard | $2 | $6 | New-gen Qwen flagship | engineer · reviewer |

### OpenAI — GPT-4.1 / 4o / o3 (legacy)

| Model | Tier | Input $/1M | Output $/1M | Best for | Recommended roles |
| --- | --- | --- | --- | --- | --- |
| `openai/gpt-4.1` | 🟡 Standard | $2 | $8 | Solid general model | engineer |
| `openai/gpt-4.1-mini` — GPT-4.1 mini | 🟢 Budget | $0.4 | $1.6 | Cheap general model | engineer · pm |
| `openai/gpt-4o` | 🟡 Standard | $2.5 | $10 | Older multimodal general model | engineer |
| `openai/gpt-4o-2024-08-06` — GPT-4o (2024-08-06) | 🟡 Standard | $2.5 | $10 | Older multimodal general model | engineer |
| `openai/gpt-4o-2024-11-20` — GPT-4o (2024-11-20) | 🟡 Standard | $2.5 | $10 | Older multimodal general model | engineer |
| `openai/gpt-4o-mini` — GPT-4o mini | 🟢 Budget | $0.15 | $0.6 | Cheap older model | pm · Guide |
| `openai/o3` | 🟡 Standard | $2 | $8 | Deep reasoning | reviewer · engineer |
| `openai/o3-pro` | 🔴 Premium | $20 | $80 | Deep reasoning, premium | reviewer · engineer |

### OpenAI — GPT-5 → 5.5

| Model | Tier | Input $/1M | Output $/1M | Best for | Recommended roles |
| --- | --- | --- | --- | --- | --- |
| `openai/gpt-5` | 🟡 Standard | $1.25 | $10 | General GPT-5 | engineer · reviewer |
| `openai/gpt-5-mini` — GPT-5 Mini | 🟢 Budget | $0.25 | $2 | Cheap GPT-5 | engineer · pm |
| `openai/gpt-5-nano` — GPT-5 Nano | 🟢 Budget | $0.05 | $0.4 | Very cheap, small tasks | pm · Guide |
| `openai/gpt-5-pro` — GPT-5 Pro | 🔴 Premium | $15 | $120 | Heavy reasoning, premium | reviewer · engineer |
| `openai/gpt-5.1` | 🟡 Standard | $1.25 | $10 | Updated general GPT-5 | engineer · reviewer |
| `openai/gpt-5.2` | 🟡 Standard | $1.75 | $14 | Updated general GPT-5 | engineer · reviewer |
| `openai/gpt-5.2-chat-latest` — GPT-5.2 Chat | 🟡 Standard | $1.75 | $14 | Chat-tuned GPT-5.2 | engineer · pm |
| `openai/gpt-5.2-pro` — GPT-5.2 Pro | 🔴 Premium | $21 | $168 | Heavy reasoning, premium | reviewer · engineer |
| `openai/gpt-5.3-chat-latest` — GPT-5.3 Chat (latest) | 🟡 Standard | $1.75 | $14 | Chat-tuned GPT-5.3 | engineer · pm |
| `openai/gpt-5.3-codex` — GPT-5.3 Codex | 🟡 Standard | $1.75 | $14 | Coding-tuned GPT-5.3 | engineer |
| `openai/gpt-5.3-codex-spark` — GPT-5.3 Codex Spark | 🟡 Standard | $1.75 | $14 | Fast coding draft | engineer |
| `openai/gpt-5.4` | 🟡 Standard | $2.5 | $15 | New-gen general model | engineer · reviewer |
| `openai/gpt-5.4-fast` — GPT-5.4 Fast | 🔴 Premium | $5 | $30 | Speed-optimized GPT-5.4 | engineer |
| `openai/gpt-5.4-mini` — GPT-5.4 mini | 🟢 Budget | $0.75 | $4.5 | Cheap mid-tier GPT-5.4 | engineer · pm |
| `openai/gpt-5.4-mini-fast` — GPT-5.4 mini Fast | 🟡 Standard | $1.5 | $9 | Cheap + fast GPT-5.4 | engineer · pm |
| `openai/gpt-5.4-nano` — GPT-5.4 nano | 🟢 Budget | $0.2 | $1.25 | Cheapest GPT-5.4 | pm · Guide |
| `openai/gpt-5.4-pro` — GPT-5.4 Pro | 🔴 Premium | $30 | $180 | Heavy reasoning, premium | reviewer · engineer |
| `openai/gpt-5.5` | 🔴 Premium | $5 | $30 | Frontier general model | engineer · reviewer |
| `openai/gpt-5.5-fast` — GPT-5.5 Fast | 🔴 Premium | $12.5 | $75 | Speed-optimized GPT-5.5 | engineer |
| `openai/gpt-5.5-pro` — GPT-5.5 Pro | 🔴 Premium | $30 | $180 | Deep-reasoning flagship | reviewer · engineer |

### OpenAI — GPT-5.6

| Model | Tier | Input $/1M | Output $/1M | Best for | Recommended roles |
| --- | --- | --- | --- | --- | --- |
| `openai/gpt-5.6` | 🔴 Premium | $5 | $30 | Frontier general model | engineer · reviewer |
| `openai/gpt-5.6-fast` — GPT-5.6 Fast | 🔴 Premium | $10 | $60 | Speed-optimized GPT-5.6 | engineer |
| `openai/gpt-5.6-luna` — GPT-5.6 Luna | 🟢 Budget | $0.2 | $1.2 | Cheap, fast GPT-5.6 | pm · Guide · engineer |
| `openai/gpt-5.6-luna-fast` — GPT-5.6 Luna Fast | 🟢 Budget | $0.4 | $2.4 | Cheap + fast GPT-5.6 | pm · engineer |
| `openai/gpt-5.6-luna-pro` — GPT-5.6 Luna Pro | 🟢 Budget | $0.2 | $1.2 | Cheap tier with more depth | engineer · pm |
| `openai/gpt-5.6-pro` — GPT-5.6 Pro | 🔴 Premium | $5 | $30 | GPT-5.6 premium | reviewer · engineer |
| `openai/gpt-5.6-sol` — GPT-5.6 Sol | 🔴 Premium | $5 | $30 | Balanced GPT-5.6 | engineer · reviewer |
| `openai/gpt-5.6-sol-fast` — GPT-5.6 Sol Fast | 🔴 Premium | $10 | $60 | Fast balanced GPT-5.6 | engineer |
| `openai/gpt-5.6-sol-pro` — GPT-5.6 Sol Pro | 🔴 Premium | $5 | $30 | Balanced tier with more depth | engineer · reviewer |
| `openai/gpt-5.6-terra` — GPT-5.6 Terra | 🟡 Standard | $2 | $12 | Mid-cost GPT-5.6 | engineer · pm |
| `openai/gpt-5.6-terra-fast` — GPT-5.6 Terra Fast | 🔴 Premium | $4 | $24 | Fast mid-cost GPT-5.6 | engineer |
| `openai/gpt-5.6-terra-pro` — GPT-5.6 Terra Pro | 🟡 Standard | $2 | $12 | Mid tier with more depth | engineer · reviewer |

### OpenAI — image / realtime / embeddings

| Model | Tier | Input $/1M | Output $/1M | Best for | Recommended roles |
| --- | --- | --- | --- | --- | --- |
| `openai/chatgpt-image-latest` | 🟢 Free | free | free | Image generation — not for agents | — |
| `openai/gpt-image-1-mini` | 🟢 Free | free | free | Image generation — not for agents | — |
| `openai/gpt-image-1.5` | 🟢 Free | free | free | Image generation — not for agents | — |
| `openai/gpt-image-2` | 🔴 Premium | $5 | $30 | Image generation — not for agents | — |
| `openai/gpt-realtime-2.1` | 🔴 Premium | $4 | $24 | Real-time audio — not for agents | — |
| `openai/text-embedding-3-large` | 🟢 Budget | $0.13 | free | Embeddings — not for agents | — |
| `openai/text-embedding-3-small` | 🟢 Budget | $0.02 | free | Embeddings — not for agents | — |
| `openai/text-embedding-ada-002` | 🟢 Budget | $0.1 | free | Embeddings — not for agents | — |


## Notes

- **Pick cheap by default.** Most agent runs (engineer, pm, Guide) are
  satisfied by a 🟢 model. Spend the 🟡/🔴 tiers on the reviewer or on a hard
  task, not on routine status updates.
- **Coding-tuned variants** (names containing `codex`, `code`, or `build`)
  are engineered for code editing and tool calls — prefer them for the engineer
  role when the price fits.
- **opencode-go** is a reduced-price gateway: the same models bill at roughly
  half the rate of the `opencode/` ids. Good when you know exactly which model
  you want.
- **Free tiers** are rate-limited and can be slower; fine for pm/Guide work or
  one-off experiments.
- The Agents page dropdown may list more or fewer models over time — re-run
  `opencode models` in a terminal to see the current list, and hit **Refresh
  models** on the Agents page to re-probe it live.

*Pricing and availability researched on 2026-08-12 from `opencode models
--verbose` (opencode's live model catalog). Treat prices as approximate —
providers change them without notice.*
