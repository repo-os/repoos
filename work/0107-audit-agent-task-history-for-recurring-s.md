---
id: "0107"
title: Audit agent task history for recurring skill gaps and propose reusable skills
type: task
status: ready
priority: p2
area: agent
assigned_to: AI
created_by: ""
branch: ""
cli_override: opencode
model_override: opencode-go/qwen3.8-max
created_at: "2026-08-11T19:49:57Z"
updated_at: "2026-08-12T04:59:30Z"
---
## Problem

Agents repeatedly rediscover RepoOS-specific workflows and failure modes while implementing tasks. Some recurring delays or mistakes may be preventable with reusable skills, but there is no evidence-based audit that separates true skill gaps from issues better fixed in product code, the RepoOS API, AGENTS.md, an ADR, task context packs, or agent configuration. Creating skills indiscriminately would add maintenance burden and duplicate existing guidance.

## Desired outcome

Review representative RepoOS task histories and produce a prioritized skill-gap audit. The audit should identify repeated discoveries, mistakes, stalls, and manual recovery procedures; trace each finding to concrete task evidence; check whether an existing skill or repository instruction already covers it; and recommend the smallest durable intervention. Recommendations come first. Do not create new skills or mutate unrelated tasks as part of this audit.

## Audit method

Review a representative set of completed, review, blocked or needs-input, restarted, and unusually slow tasks. Use task files, activity records, persisted transcripts where available, git history, and relevant implementation evidence. Include recent examples involving worktree close-out and merge conflicts, permission or sandbox failures, RepoOS API usage, preview-port collisions, stale builds, repeated codebase discovery, model/agent selection, and Cloudflare tunnel setup when the evidence supports them.

For every candidate, decide among: create a reusable skill; improve an existing skill; update AGENTS.md or repository docs; write or update an ADR; improve task context packs; add a RepoOS API/tooling guardrail; change agent configuration or model selection; or take no action.

## Acceptance criteria

- [ ] Add a versioned audit document under docs/ that explains the sample, evidence sources, evaluation rubric, findings, and limitations.
- [ ] Review enough task histories to cover successful, slow, restarted, blocked/needs-input, merge-conflicted, and failed-agent cases; list every task ID included in the sample.
- [ ] Identify repeated knowledge or procedural gaps using concrete evidence from at least two tasks per proposed reusable skill, unless a single incident is explicitly justified as high-impact and broadly repeatable.
- [ ] Inventory existing repository instructions and available skills before proposing new ones, and flag overlap or candidates for consolidation.
- [ ] For each finding, classify the best intervention: new skill, existing-skill improvement, AGENTS.md/docs, ADR, context-pack change, RepoOS API/tooling fix, agent/model configuration, or no action.
- [ ] Rank recommendations by expected time saved, frequency, failure severity, implementation effort, and maintenance cost.
- [ ] Each proposed skill includes a narrow purpose, trigger conditions, non-goals, required inputs, expected outputs, evidence task IDs, and a rough validation scenario.
- [ ] Explicitly distinguish reusable operational knowledge from product defects; do not use a skill to paper over a bug or missing API that RepoOS should fix directly.
- [ ] Recommend a lightweight future close-out mechanism for agents to flag skill candidates without automatically creating skills. Include deduplication and human-review safeguards.
- [ ] Produce a short prioritized next-actions section. Any proposed skill creation or follow-up implementation remains a separate task requiring approval.
- [ ] Do not expose secrets or copy credentials from transcripts into the audit. Redact sensitive command arguments and values.
- [ ] Run repoos check before moving the task to review.

## Notes for AI

This is an analysis and documentation task, not permission to create or install skills. Prefer RepoOS APIs and persisted task evidence over ad hoc filesystem mutation. Do not judge agents solely by elapsed time: separate model latency, local CPU/memory pressure, context-loading time, permission waits, test runtime, and actual reasoning/workflow gaps when the evidence allows. If transcript retention is incomplete, state that limitation rather than inventing evidence.

## Activity

- 2026-08-11T19:50:32Z · body
- 2026-08-12T04:59:30Z · cli_override, model_override
