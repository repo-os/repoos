# AI token usage: cost-optimization strategy

Practical guidance for reducing what RepoOS spends on model providers. Written for both AI agents picking a model for a task and human engineers configuring agents/tasks. Not a code-change proposal — apply these as config (`agent_override` / `cli_override` / `model_override` in task frontmatter, or `Agent` records) and workflow habits.

## 1. Where the cost actually comes from

Two independent levers, and they compound:

- **Direct cost**: `$/input-token × input-tokens + $/output-token × output-tokens`. Model choice sets the price-per-token; task complexity and context size set the token count.
- **Indirect cost**: more tool calls, more retries, more back-and-forth clarification, more verbose output all inflate token count *regardless* of model. A cheap model that flails and burns 3x the turns can cost more than an expensive model that finishes in one pass.

Optimizing only the model (lever 1) while ignoring context/verbosity/tool-call bloat (lever 2) leaves most of the savings on the table. Both matter.

RepoOS's own task corpus (120 tasks in `work/`) ranges from 18-line chores to 213-line multi-phase features (median 86 lines). Task size is the single best proxy available today for expected token spend — see §3.

## 2. Model efficiency profiles

RepoOS surfaces whatever models the configured CLI reports (`src/core/models.ts`), plus a synthetic `"default"` choice. Profiles below are for the current Claude family, since `cli_override: claude code` is RepoOS's own primary agent CLI; opencode/codex expose different provider catalogs but the same tiering logic applies.

| Model | Relative cost | Best for | Avoid for |
|---|---|---|---|
| **Haiku** | Lowest ($1/$5 per MTok) | Small, well-scoped chores; mechanical edits; single-file changes; tasks with a short, unambiguous spec | Tasks needing large context (big diffs, multi-file reasoning), open-ended investigation, or anything where a wrong guess is expensive to review. **Smaller context window (200K) — long specs, large repos, or long-running agentic sessions can hit "prompt too long" and fail outright**, as happened on this task |
| **Sonnet** | Mid ($2-3/$10-15 per MTok, intro pricing through 2026-08-31) | The default for most RepoOS tasks — near-Opus quality on coding/agentic work at a fraction of the cost. Good fallback when Haiku's context window or reasoning depth is insufficient | Tasks that are trivially small (Haiku would suffice) or that need Opus-tier long-horizon autonomy |
| **Opus** | High ($5/$25 per MTok) | Large refactors, ambiguous specs needing judgment, multi-phase features (the 150+ line tasks), architecture-level decisions, anything where getting it right the first time matters more than cost | Simple chores, mechanical tasks, anything Sonnet already handles well — reflexively defaulting to Opus wastes budget |
| **Fable** | Highest ($10/$50 per MTok) | Only the hardest, most autonomous, long-horizon work where failure cost is high and no cheaper model has succeeded | Default choice for any RepoOS task type. This tier should be rare and deliberate, not a default |

**Key finding from this task**: `model_override: haiku` on task 0126 failed with "prompt is too long" — Haiku's 200K context window is the smallest of the family, and it's also more sensitive to large system prompts / long task specs / big skill files loaded into context. **Haiku is a poor choice for any task whose prompt (spec + skills + repo context) approaches or exceeds ~150K tokens.** This is a concrete, immediately-actionable finding: don't `model_override: haiku` on tasks with long specs, multiple skills invoked, or large read context.

## 3. Decision framework: which model for which task

Use task size and risk as the primary signals — both are visible in the task file before work starts.

```
                     Low ambiguity / mechanical         High ambiguity / judgment-heavy
                    ┌─────────────────────────────┬─────────────────────────────────┐
Small (<40 lines,   │  Haiku                       │  Sonnet                          │
1-2 files)          │  (18-line chores, single-    │  (small task, but the "right     │
                    │  field config changes)       │  answer" isn't obvious)          │
                    ├─────────────────────────────┼─────────────────────────────────┤
Medium (40-100      │  Sonnet                      │  Sonnet                          │
lines, few files)   │  (median RepoOS task)        │  (default — most tasks land here)│
                    ├─────────────────────────────┼─────────────────────────────────┤
Large (100+ lines,  │  Sonnet                      │  Opus                            │
multi-phase/file)   │  (mechanical but big, e.g.   │  (architecture calls, multi-     │
                    │  bulk rename)                │  phase features like 0068)       │
                    └─────────────────────────────┴─────────────────────────────────┘
```

Concrete rules:

1. **Default to Sonnet.** It's the right choice for the median RepoOS task (86 lines) and should be the agent's default `model` unless a specific reason overrides it.
2. **Only drop to Haiku when all of these hold:** task spec + acceptance criteria fit in well under 100 lines, the change touches 1-2 files, the fix is mechanical (no design judgment required), and no skill with a large SKILL.md is going to be invoked mid-task. If any of these is false, Haiku risks context blowout or a low-quality result that needs rework (rework cost > the savings).
3. **Escalate to Opus for:** multi-phase features (see 0068's 213-line spec), tasks explicitly requiring architectural tradeoffs, or any task where the acceptance criteria include "no scope creep" / cross-cutting constraints that need careful tracking across a long session.
4. **Never default to Fable.** Reserve it for cases where Opus has already been tried (or is confidently predicted to be insufficient) on a task with high failure cost.
5. **When a model fails on a task (context limit, poor output), don't retry blind on the same model.** Escalate one tier and note why in the task's Activity log — this is exactly what's happening on 0126 right now.
6. **Set `model_override` at task creation, not as an afterthought.** Whoever files the task (human or PM agent) is best positioned to judge complexity before work starts — cheaper than discovering mid-run that the model is underpowered.

## 4. Skills and their token-efficiency effect

RepoOS currently has two skills:

- **`caveman`** — forces short sentences, plain vocabulary, no filler words. This reduces *output* token count directly (shorter responses) and has a secondary effect of reducing follow-up-message length in conversational tasks. Use for: status updates, changelogs, or any task whose primary output is prose rather than code. Low value for tasks whose bulk of tokens is code diffs, not narration — skip it there.
- **`code-review`** — a structured procedure (read task → review diff → run checks → verify) rather than a verbosity control. Its token-efficiency value is *indirect*: a disciplined review checklist prevents the back-and-forth of an incomplete review (re-reading the same diff twice, asking clarifying questions the spec already answered). Use it as designed — before every sign-off — since skipping it costs more in rework than the skill itself costs in tokens.

Note: the task spec for 0126 mentions "rtk" and "simplify" as skills to evaluate — **neither exists in this repo's `skills/` directory.** `simplify` exists as a slash-command in the broader Claude Code environment (quality/reuse cleanup pass) but is not a RepoOS-repo skill; "rtk" doesn't correspond to any skill file found. Recommendation: don't invoke skills that don't exist — if `rtk` is a token-reduction skill the team wants, it needs to be authored first (see §7 architectural suggestions).

**General skill guidance**: every skill's SKILL.md is loaded into context when invoked. A skill with a long SKILL.md (multi-page procedures) has a fixed token overhead paid on every invocation — worth it only if the alternative (an agent improvising without the skill) costs more in retries/inconsistency than the skill's own footprint. Keep SKILL.md files short and procedural, not exhaustive reference docs.

## 5. Tool-call and execution patterns that reduce overhead

These apply regardless of model choice — they're the "indirect savings" lever from §1.

- **Batch parallel-safe tool calls.** Multiple independent reads/greps/searches in one turn beat sequential single calls — each round-trip has fixed overhead (tool schema tokens, response framing) beyond the actual work.
- **Read only what's needed.** Full-file reads on large files when only a function matters waste input tokens on every subsequent turn that re-sends conversation history. Prefer targeted reads (line ranges, grep-first-then-read) over blind full-file reads, especially early in a task when you don't yet know if the file is relevant.
- **Avoid re-reading files you already have in context.** The harness doesn't re-send unchanged file contents automatically in all cases — but repeatedly issuing `Read` on the same unchanged file is pure waste. Trust what's already been read this session.
- **Prefer Explore/general-purpose subagents for open-ended search, not the main loop.** Spawning a subagent to do a multi-file investigation keeps the exploratory back-and-forth (many small tool calls, false starts) out of the main context, which the main agent would otherwise carry for the rest of the task at full price.
- **Delegate cheap, well-scoped subagent work to a cheaper model.** RepoOS's `agent_override`/`cli_override`/`model_override` are per-task, not per-subagent, so this mostly matters for future subagent-model-selection work (see §7) — but where the harness allows it, a Haiku-tier subagent doing a narrow grep-and-report task is strictly better than paying Opus rates for it.
- **Don't run `repoos check` or full builds speculatively mid-task.** AGENTS.md's definition of done already scopes verification to end-of-task — running it repeatedly "just to check" burns tool-call and output tokens on the same verification the final check will redo.
- **Keep task specs and acceptance criteria tight.** Every line in a task file is loaded into context on every turn the agent operates in that task. A 213-line spec (0068) costs meaningfully more per turn than an 18-line one (0008) — write specs at the size the task actually needs, not maximally detailed "just in case."

## 6. Patterns to avoid

- **Defaulting every task to Opus "to be safe."** This is the single biggest avoidable cost. Most RepoOS tasks (median 86 lines) don't need Opus-tier reasoning.
- **`model_override: haiku` on tasks with long specs or multiple skills.** Concretely demonstrated by this task's own failure — Haiku's smaller context window means a spec + Notes-for-AI + skill content that's fine on Sonnet can overflow Haiku.
- **Retrying a failed run on the same model without escalating.** If a model hits a context or quality wall, the fix is a tier change, not a repeat.
- **Verbose, uninstructed agent output on narration-heavy tasks.** Long status updates, restating the task back to the user, or narrating every intermediate step all cost output tokens for no acceptance-criteria value. `caveman` (or plain terse-response instructions) directly addresses this.
- **Blind full-repo reads or greps with no scope.** Searching or reading without first narrowing (by directory, file type, or known area from the task's `area` field) multiplies token cost for marginal information gain.
- **Skills with bloated SKILL.md files invoked routinely.** Every invocation pays the full-file cost; keep skill content procedural and short.
- **Speculative or repeated verification mid-task** instead of once at the end per AGENTS.md's defined workflow.

## 7. Architectural / workflow suggestions (not implemented here — deferred)

- **Task-size-based default model selection.** RepoOS already has `area`/`type`/`priority` frontmatter; a lightweight heuristic (task file line count + type) could suggest a default `model_override` at task creation time, surfaced to the human/PM agent as a suggestion rather than silently applied.
- **Track `tokens`/`costUsd` from `AgentSessionStats` (already in `src/core/types.ts`) into a persisted per-task or per-model rollup.** The fields exist for live session telemetry but aren't currently aggregated anywhere durable — without that, "which model is actually cost-effective for which task type" stays a guess rather than measured.
- **Author a real token-reduction skill** (what the task notes gestured at with "rtk") if the team wants a repeatable, invocable procedure beyond `caveman`'s prose-terseness — e.g. a skill that instructs an agent to scope reads/greps tightly and avoid speculative verification, codifying §5 above.
- **Fail-soft model escalation.** When a model run fails with a context-limit or similar hard error (as happened here), a scripted fallback to the next tier up — rather than requiring a human to notice and re-trigger — would turn today's manual escalation into an automatic one.
- **Surface model cost/tier in the Agents page UI** alongside the existing model dropdown (`src/core/models.ts` already probes available models) so humans configuring `Agent.model` see the cost tier, not just the model id string.
