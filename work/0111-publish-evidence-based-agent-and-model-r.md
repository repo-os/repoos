---
id: "0111"
title: Publish evidence-based agent and model recommendations for RepoOS tasks
type: feature
status: ready
priority: p2
area: agent
assigned_to: AI
created_by: ""
branch: ""
created_at: "2026-08-12T03:44:24Z"
updated_at: "2026-08-12T03:45:22Z"
---
## Problem

RepoOS can discover agents and models and test whether a CLI/model combination responds, but it does not explain which combinations have actually worked well for particular RepoOS task types. Users must rely on memory and anecdotes when choosing between fast and thorough models, or when deciding which agent is best for UI work, core/server changes, documentation, task specification, debugging, review, or merge recovery.

A static best-model list would become stale quickly and could overstate conclusions drawn from a tiny sample. Compatibility, quality, speed, reliability, cost, and task fit are different dimensions, and model availability varies by machine and account.

## Desired UX

Create one canonical, versioned agent/model recommendation guide in the RepoOS knowledge base and make it easy to find from the Agents page. The guide recommends agents and models by RepoOS task category using observed RepoOS outcomes, shows the evidence and confidence behind each recommendation, identifies fast/default and thorough/escalation choices where justified, and clearly marks unknown or insufficient evidence.

The Agents page should provide a concise summary or link into the canonical guide rather than maintain a second hard-coded copy. Recommendations are advisory; they do not automatically change saved agents, per-task overrides, or launch work without user action.

## Acceptance criteria

- [ ] Add a canonical document under docs/ for agent and model selection, with durable navigation from the Context/knowledge-base UI and a visible Recommendations or Choosing an agent entry point on the Agents page.
- [ ] Organize recommendations by useful RepoOS task categories, including at least UI/visual work, core/server architecture, focused bug fixes, tests and debugging, documentation/analysis, task specification/PM work, code review, and merge or close-out recovery. Combine categories when evidence does not support a meaningful distinction.
- [ ] For each supported CLI, explain its relevant capabilities and limitations: structured output, same-session resume, model discovery, permission behavior, speed/latency characteristics, and suitability for unattended work.
- [ ] For each recommended CLI/model/category combination, record recommendation role, evidence task IDs or measurements, sample size, success definition, confidence, last-verified date, known failure modes, and important caveats.
- [ ] Distinguish compatibility from performance. A passing #0083 model probe proves that a command works, not that the model is high-quality, fast, economical, or suitable for every task.
- [ ] Define success using observable RepoOS signals where available: reaching review with repoos check green, human approval, review-fix count, retries/restarts, needs-input or stall events, elapsed time to first meaningful edit, total active time, and close-out outcome. Do not equate raw elapsed time with model quality.
- [ ] Never invent rankings when telemetry or transcripts are incomplete. Show Unknown or Insufficient evidence, document the missing data, and use clearly labelled qualitative observations only when quantitative comparison is impossible.
- [ ] Include a practical default recommendation plus a fast option and a thorough/escalation option only where the evidence supports them. Avoid declaring one universal best model.
- [ ] Account for model volatility: use exact model names and aliases as last verified, note availability can vary by account/provider, and link recommendations to live model discovery and compatibility results rather than keeping unavailable choices selectable.
- [ ] Use a single source of truth so Agents-page copy cannot drift from the knowledge-base document. If the UI renders a summary, derive it from the same repository data/document or keep it to stable navigation and methodology copy.
- [ ] Add a documented refresh procedure that an agent or human can follow after a meaningful batch of completed tasks: gather evidence, compare like task categories, update confidence/sample/date, retain noteworthy regressions, and submit changes for review.
- [ ] State that the refresh should become recurring after scheduled tasks exist; link to #0093. Until then, provide a manual freshness indicator and do not imply automatic updating.
- [ ] Keep raw secrets, credentials, sensitive prompts, and unredacted transcript content out of the guide. Aggregate only the minimum evidence needed for recommendations.
- [ ] Add UI/document tests for navigation, rendering, empty or insufficient-evidence states, and no duplicated stale recommendation table; rebuild assets, refresh relevant screenshots, and pass repoos check.

## Notes for AI

Start with repository evidence, including task metadata, persisted transcripts when safe and available, git history, model compatibility results, and telemetry added by related tasks. Task #0107 audits reusable skill gaps and may supply useful task-history methodology, but this task owns agent/model selection guidance rather than skill recommendations. If evidence collection is not yet sufficient for reliable rankings, publish the useful framework and honest provisional observations, then identify the smallest follow-up instrumentation gap instead of manufacturing precision. Do not add automatic agent routing or paid background benchmarking in this task.

## Related

- #0080 — agent run telemetry and stall evidence
- #0083 — CLI/model compatibility probes
- #0090 — persisted task transcripts
- #0093 — recurring and scheduled tasks
- #0107 — task-history skill-gap audit

## Activity

- 2026-08-12T03:45:22Z · body
