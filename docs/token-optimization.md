# AI efficiency and spend strategy

Practical, provider-neutral guidance for controlling the cost of work run
through RepoOS. It applies to every configured coding-agent CLI and its
account-available models, not to a particular vendor or named model family.

This is a workflow guide, not a pricing table or a routing algorithm. Configure
the selected `cli_override` and `model_override` on a task, or configure an
Agent record in `repoos.toml`. Keep `"default"` when the CLI's own account and
policy-aware selection is preferable.

## 1. Optimize completed outcomes, not token price alone

The useful unit is **cost per accepted task**, not cost per token:

    model/API charges + retries + human review/rework + elapsed-time cost

A lower-priced model can be the expensive choice if it requires repeated runs,
misses a cross-cutting constraint, or cannot use the tools needed for the task.
Likewise, a higher-priced model can be justified for a short high-risk decision.

RepoOS currently persists task/workflow facts and exposes live session data, but
does not yet maintain a durable per-provider cost ledger. Treat any model-price
or context-window claim as external, time-sensitive account information. Obtain
it from the active provider's billing and model documentation at the time a
budget decision is made; do not hard-code it in task guidance.

## 2. Compatibility first

There are three independent choices:

| Decision | Question | RepoOS source of truth |
|---|---|---|
| Agent CLI | Can this CLI safely run, resume, and stream this task? | Agents page detection and the configured Agent record |
| Model | Is this model available to this account and compatible with that CLI? | The CLI's live picker/probe where supported; otherwise the CLI/account configuration |
| Execution policy | Does the model have the context, tools, permissions, and reliability needed here? | A small compatibility test plus task evidence |

RepoOS supports multiple CLIs and intentionally keeps model discovery
adapter-specific. Some CLIs can provide an account-aware model list; others
expose only aliases or no stable discovery command. A dropdown is therefore a
convenience, not a portable catalog or a promise that every displayed model is
available to every account.

Current integrations span OpenCode, Claude Code, Qwen Code, Codex, and GitHub
Copilot CLI. They differ in their invocation, model-discovery, session, output,
and permission capabilities; those differences are adapter concerns, not a
reason to make the operating policy vendor-specific.

The names in this task's original brief (Haiku, Sonnet, Opus, and Fable) must
not be interpreted as a universal taxonomy: named Claude aliases apply only to
the Claude Code integration, and `Fable` is not an offered RepoOS model. Use
the model identifier accepted by the selected CLI. Prefer `"default"` when
there is no documented, account-aware way to enumerate or pin models.

## 3. A provider-neutral selection framework

Classify the task before choosing an override:

| Task characteristic | Start with | Escalate or change when |
|---|---|---|
| Mechanical, bounded change with clear acceptance criteria | The least-expensive compatible model that has passed a comparable task | The first run needs repeated correction, lacks required tool support, or fails validation |
| Ordinary implementation or review | The configured agent/model default | Evidence shows a lower-cost compatible option meets the same quality bar |
| Cross-cutting, ambiguous, security-sensitive, or architecture work | A proven high-capability compatible model, with a bounded plan | A narrower subtask can be isolated and delegated after the main decision is made |
| Research or unfamiliar integration | A model/CLI that can use the documented interface and stop on missing evidence | The evidence budget is reached; record the unsupported result rather than retrying blindly |

Use this loop:

1. **Start from compatibility evidence.** Choose a model that the account can
   run with the desired CLI and narrow tool permissions.
2. **Set a bounded objective.** Define the acceptance criteria, a time/turn or
   cost budget, and the validation command before starting.
3. **Measure the result.** Record completion, retries, validation outcome,
   elapsed time, and any available token/cost telemetry.
4. **Change one variable.** For the next comparable task, change the model,
   CLI, context pack, or workflow--not several at once.
5. **Promote only repeatable evidence.** A routing recommendation needs several
   comparable successful tasks, not one anecdote or a provider marketing claim.

Do not infer capability from a name such as "small", "fast", "pro", or
"reasoning." Provider offerings, account entitlements, and aliases change.

## 4. Reducing input, output, and retry overhead

These practices save work across all providers and model families:

- Keep task scopes and acceptance criteria specific enough to avoid discovery
  loops, but do not add irrelevant history or speculative requirements.
- Read narrowly: search first, then inspect only the relevant symbol or line
  range. Avoid repeating unchanged reads in the same session.
- Batch independent reads and probes. It reduces round trips and gives the
  agent a coherent basis for the next decision.
- Use the task worktree and documented RepoOS APIs. Avoid external binary
  scraping, broad permissions, and unbounded exploration; they add risk and
  frequently create expensive dead ends.
- Run targeted validation while iterating and the required `repoos check` at
  handoff. Do not repeat expensive checks without a changed hypothesis.
- Keep status updates concise. Narrative output is useful only when it changes
  a decision or records evidence needed by the next operator.
- Stop and surface a decision when an account restriction, unsupported
  capability, or permission boundary blocks progress. Repeating the same
  denied action is neither a reliability nor a cost strategy.

## 5. Skills, tools, and delegation

RepoOS skills are procedural context, not model capabilities. Invoke a skill
when its checklist prevents meaningful rework; skip it when it does not apply.
At present, `caveman` can reduce prose overhead for narration-heavy work, while
`code-review` reduces costly missed defects through a structured sign-off
procedure. Their value is indirect and should be evaluated by rework avoided,
not by assuming a fixed token saving.

`rtk` and `simplify` are not RepoOS skills in this repository. A command,
plugin, or skill available in one agent environment must be treated as
provider-specific until it is documented, available to the target Agent, and
shown to improve comparable outcomes.

Delegate only independent, well-bounded investigations. Give each delegate a
clear question, allowed tools, output shape, and stop condition. Use a cheaper
or faster compatible model only after it has demonstrated adequate quality for
that subtask; otherwise delegation merely multiplies context and review cost.

## 6. Patterns to avoid

- Hard-coding vendor prices, model aliases, context limits, or release dates in
  RepoOS policy.
- Treating a provider's flagship or lowest-cost model as the universal default.
- Selecting a model solely because its name suggests a tier.
- Retrying a failed run with the same prompt, permissions, and model without a
  new hypothesis.
- Treating an unsupported model-list command as permission to scrape a CLI
  binary or relax tool/path permissions.
- Using task-file length as a proxy for complexity without considering changed
  surface area, ambiguity, validation cost, and failure impact.

## 7. Future improvements (separate implementation work)

1. Persist normalized session usage, retry, validation, and outcome metrics by
   CLI/model/task class, while treating unavailable provider fields as unknown.
2. Add per-CLI capability metadata: model discovery quality, resume support,
   output format, tool-permission model, and known limitations.
3. Provide a human-reviewable routing suggestion based on local evidence and
   configurable budgets. It must recommend rather than silently override the
   task's selected CLI or model.
4. Maintain small, reproducible compatibility probes for each supported CLI.
   They should verify a named model only when the CLI documents that selection,
   and retain `"default"` as the safe fallback.
5. Evaluate future providers, local models, remote services, and new agent
   protocols through the same compatibility, evidence, budget, and outcome
   framework rather than extending a vendor-specific tier table.

This approach keeps RepoOS agent/model agnostic: it optimizes decisions from
local evidence and account capabilities while allowing the set of agents,
providers, models, and execution strategies to evolve.
