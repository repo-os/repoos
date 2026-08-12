# Agent and Model Recommendations

**Version:** 1.0.0
**Last verified:** 2026-08-12
**Status:** Initial framework — evidence collection not yet automated
**Refresh:** Manual until #0093 (recurring/scheduled tasks) is complete

## Purpose

This guide recommends coding-agent CLIs and models for RepoOS task categories based on observed outcomes in this repository. It is advisory — it does not automatically change saved agents, per-task overrides, or launch work. It lives at a single canonical URL so the Agents page can link in rather than duplicating copy.

Every recommendation is tagged with confidence, sample size, and the evidence behind it. Where evidence is insufficient the guide says so explicitly rather than manufacturing precision.

## How to read this guide

- **Compatibility** (does the CLI/model respond to a prompt?) is distinct from **performance** (does it complete real tasks reliably?). A green #0083 probe confirms only the former.
- **Success** is measured by observable RepoOS signals: reaching `review` with `repoos check` green, human approval, review-fix count, retries/restarts, `needs-input` or stall events, elapsed time to first meaningful edit, total active time, and close-out outcome. Raw elapsed time alone is not a quality signal.
- **Fast** picks are for quick, low-risk work where turnaround time matters more than thoroughness. **Thorough / escalation** picks are for complex or high-stakes work where correctness is paramount. Not every category has enough evidence to justify two tiers.
- **Unknown** means no task has been run with that combination in that category. **Insufficient evidence** means some data exists but the sample is too small to draw conclusions.

## Supported CLIs

RepooOS has RepoOS drivers (spawns child processes with `--auto`/`--dangerously-skip-permissions`) for exactly four coding-agent CLIs. A CLI must be headless-installable and accept stdin/stdout control to be drivable.

### opencode

| Capability | Status | Notes |
|---|---|---|
| Structured output | Yes | `--format json` produces per-line JSON events |
| Same-session resume | Yes | `--resume <session-id>` plus follow-up prompts |
| Model discovery | Yes | `opencode models` returns live model list per provider |
| Permission behavior | Auto-skip | `--dangerously-skip-permissions` for unattended runs |
| Speed | Varies by model | CLI overhead is minimal; model choice dominates |
| Unattended work | Yes | Designed for headless agent operation |
| File edit tool | Yes | Structured edit tool (`oldString`/`newString` replacements) |
| Write tool | Yes | Whole-file writes |
| Bash tool | Yes | Command execution with working-directory isolation |
| Multi-tool parallelism | Yes | Issued as single-message tool call batches |

### claude code

| Capability | Status | Notes |
|---|---|---|
| Structured output | Yes | `--output-format stream-json` (added via #0109) |
| Same-session resume | Unknown | Driver support not yet validated |
| Model discovery | No | Models tied to the Claude API; no separate discovery |
| Permission behavior | Auto-skip | `--dangerously-skip-permissions` |
| Speed | Varies by model | CLI startup may be slower than opencode |
| Unattended work | Partial | Headless-capable but resume/recovery less proven |

### qwen code

| Capability | Status | Notes |
|---|---|---|
| Structured output | No | No machine-parseable output format in the driver |
| Same-session resume | Unknown | Driver support not yet validated |
| Model discovery | No | No model list command |
| Permission behavior | Auto-skip | `--dangerously-skip-permissions` |
| Speed | Unknown | Not benchmarked |
| Unattended work | Unknown | Headless-capable in principle; untested in practice |

### codex

| Capability | Status | Notes |
|---|---|---|
| Structured output | Yes | App-server JSON protocol |
| Same-session resume | Unknown | Driver support not yet validated |
| Model discovery | Yes | App-server `model/list` endpoint |
| Permission behavior | Auto-skip | App-server managed |
| Speed | Unknown | Not benchmarked |
| Unattended work | Unknown | Server-mode capable; untested in RepoOS runs |

## Recommendations by task category

### UI / visual work

Tasks that change the Vue 3 SFC UI (`src/ui-app/`): layout, styling, component structure, visual polish, screenshot capture.

**Evidence:** Insufficient. No UI task has been run with a non-opencode CLI. The existing UI tasks (#0032-#0063, #0066, #0095, #0104, #0108) all used opencode with various models.

| Role | CLI | Model | Confidence | Sample | Last verified |
|---|---|---|---|---|---|
| Default / fast | opencode | big pickle | Provisional | ~15 tasks | 2026-08-12 |
| Thorough | Unknown | Unknown | — | 0 | — |

**Notes:** opencode's `--format json` structured output provides reliable tool-call parsing. No other CLI has been tested on a UI task. UI tasks benefit from the structured `edit` tool over raw `write` because components are rarely rewritten from scratch. The default recommendation matches what has been used historically; a thorough tier needs evidence from a stronger model on complex UI tasks.

### Core / server architecture

Tasks that change the engine layer (`src/core/`, `src/server/`, `src/cli/`): build system, SSE streaming, task lifecycle, config, git operations, context-pack generation, CLI interface.

**Evidence:** Insufficient. All core/server tasks used opencode.

| Role | CLI | Model | Confidence | Sample | Last verified |
|---|---|---|---|---|---|
| Default | opencode | big pickle | Provisional | ~30 tasks | 2026-08-12 |
| Thorough | Unknown | Unknown | — | 0 | — |

**Notes:** Core tasks require understanding of invariants (agents.md, architecture.md) and cross-cutting concerns. The same-model-on-opencode default has produced tasks that reached `review` and `done`. No reason to deviate without evidence that another combination is better.

### Focused bug fixes

Well-scoped bug fixes with clear reproduction steps and a narrow blast radius.

**Evidence:** Insufficient. Bug-fix tasks have been interleaved with feature work; no separate tracking.

| Role | CLI | Model | Confidence | Sample | Last verified |
|---|---|---|---|---|---|
| Default | opencode | big pickle | Provisional | — | 2026-08-12 |
| Fast | Unknown | Unknown | — | 0 | — |

**Notes:** Bug fixes are good candidates for a fast tier (cheaper/faster model for narrow work) but no comparison data exists. The recommendation is a placeholder until evidence supports a distinction.

### Tests and debugging

Tasks focused on test authoring, test-failure diagnosis, debugging workflows, or test infrastructure.

**Evidence:** Insufficient. Test-only tasks are rare in the task history; most tests were written as part of feature tasks.

| Role | CLI | Model | Confidence | Sample | Last verified |
|---|---|---|---|---|---|
| Default | opencode | big pickle | Provisional | — | 2026-08-12 |

**Notes:** Test tasks benefit from models that can run the test suite iteratively and diagnose failures. No CLI comparison exists.

### Documentation / analysis

Tasks that produce documentation, audit reports, gap analyses, or explanatory content without changing source code.

**Evidence:** Insufficient. Documentation-only tasks (#0044, #0107) used opencode.

| Role | CLI | Model | Confidence | Sample | Last verified |
|---|---|---|---|---|---|
| Default | opencode | big pickle | Provisional | ~2 tasks | 2026-08-12 |

**Notes:** Documentation tasks are lower stakes than code changes. A fast tier (cheaper model) may be appropriate but no evidence yet distinguishes models for pure-analysis work.

### Task specification / PM work

Freeform task creation, roadmap grooming, requirement analysis, task splitting/refinement.

**Evidence:** Insufficient. PM-agent tasks are infrequent; most task specs were authored by a human.

| Role | CLI | Model | Confidence | Sample | Last verified |
|---|---|---|---|---|---|
| Default | opencode | big pickle | Provisional | — | 2026-08-12 |

**Notes:** The PM agent is enabled by default but rarely exercised in headless mode. Freeform task creation uses a one-shot prompt; structured output parsing is not required.

### Code review

Automated code review triggered when a task enters `review` status. The reviewer agent reads the branch diff and writes a short report.

**Evidence:** Insufficient. The reviewer agent (enabled for automated review via #0109) has limited history and no multi-CLI comparison.

| Role | CLI | Model | Confidence | Sample | Last verified |
|---|---|---|---|---|---|
| Default | opencode | big pickle | Provisional | — | 2026-08-12 |

**Notes:** Review is a one-shot operation — the agent reads a diff and writes a report. Latency is the primary user-facing metric; correctness matters for report quality. A fast tier may be appropriate for review since it runs on every `review` transition. No data exists to support a recommendation.

### Merge / close-out recovery

Recovery from merge conflicts, stale worktrees, board divergence, or close-out failures.

**Evidence:** Insufficient. Recovery tasks are ad-hoc and infrequent.

| Role | CLI | Model | Confidence | Sample | Last verified |
|---|---|---|---|---|---|
| Default | opencode | big pickle | Provisional | — | 2026-08-12 |

**Notes:** Recovery operations are structurally similar to core/server work but operate on the repo's git/build state rather than source code. No comparison data exists.

## Default recommendation (practical starting point)

For users setting up RepoOS for the first time, or for any category where evidence is insufficient:

- **CLI:** opencode — best driver maturity, structured output, model discovery, same-session resume
- **Model:** Use live model discovery (`opencode models`) to pick a model available on your machine. `big pickle` is the configured default and has the most task history in this repo. `deepseek v4` and `gpt-5.6-sol` are alternatives discovered via live probing; their performance on RepoOS tasks is not yet characterized.
- **Why:** This is the combination used for nearly every completed RepoOS task. It is not proven superior — we simply have no evidence that anything else works better.

## Model volatility

- Model names and availability change. The exact model IDs listed in this guide are as last verified and may not match current live discovery results.
- Always check live model discovery on the Agents page before selecting a model. The `Refresh models` button probes `opencode models --refresh` and updates available options.
- Compatibility with one account/provider does not guarantee compatibility with another. Model access is account-dependent.

## Known failure modes

Common patterns across all CLIs and models observed in this repo:

| Failure mode | Detection |
|---|---|
| Agent stalls (no output for 90s) | `AgentRunner` sweep raises a stall event |
| Agent produces invalid file edits | `tsc` build failure or test failure in `repoos check` |
| Agent introduces unrendered mustache in UI | `repoos check` smoke test catches this |
| Agent writes to wrong file or worktree | Git diff review catches this |
| Agent produces an empty or no-op edit | Task stays active with no diff; human or automated review catches this |
| Agent fails to understand RepoOS conventions | Stale build warning, wrong import extensions, or AGENTS.md violation |

## Refresh procedure

Until #0093 adds recurring/scheduled tasks, refresh is manual. After a meaningful batch of completed tasks (≥5 in a category):

1. Gather evidence from task transcripts in `.repoos/sessions/` and git history (`git log --oneline --grep="task\|docs("`).
2. For each category with new evidence, compare outcomes across CLI/model combinations used.
3. Update confidence, sample size, and last-verified date. Retain noteworthy regressions (if a previously-recommended combination failed on a recent task, note it).
4. If a new combination outperforms the current recommendation, add it as a tier (fast or thorough) rather than replacing the default until evidence is overwhelming.
5. Submit changes for review as a normal RepoOS task. Do not merge recommendation changes without review.

Once #0093 is complete, this procedure should become a recurring task that runs on a schedule, collecting evidence from transcripts and updating the guide automatically.

## Related tasks

- #0080 — Agent run telemetry and stall evidence
- #0083 — CLI/model compatibility probes
- #0090 — Persisted task transcripts
- #0093 — Recurring and scheduled tasks
- #0107 — Task-history skill-gap audit
