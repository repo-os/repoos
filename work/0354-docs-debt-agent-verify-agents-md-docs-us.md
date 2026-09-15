---
id: "0354"
title: "Docs Debt Agent: verify AGENTS.md/docs/user-docs claims against real code"
type: feature
status: ready
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: ""
model_override: openrouter/deepseek/deepseek-v4.1-flash
review_model_override: openrouter/google/gemini-3.8-flash
created_at: "2026-09-15T12:59:49Z"
updated_at: "2026-09-15T15:41:48Z"
---
## Problem

`AGENTS.md`, `docs/`, and `user-docs/` drift from the code they describe —
#0343 (mermaid landed in `dependencies` while AGENTS.md/landing page both
claimed "zero runtime dependencies") was only caught by a manual audit.
AGENTS.md now requires implementing agents to fix doc drift their OWN diff
introduces (see "Docs and context can go stale — inline scope vs. periodic
audit", added in commit 345acdad), but nothing catches drift that
accumulates in docs nobody's actively touching. That needs a periodic sweep
with the whole repo in view — a job for a dedicated built-in agent, not
something to fold into the existing "Tech Debt Agent."

## Why not just widen the Tech Debt Agent

Discussed and rejected in the PM interview: a broad "tech debt" mandate
(code duplication, complexity, outdated deps, AND doc drift) produces vague
prompts and noisy, low-signal findings. A dedicated agent with exactly one
job — is what's written still true — can be held to a sharp bar. This
mirrors how Tech Debt / Performance / Architect / Design are already split
by concern rather than merged into one omnibus agent.

## Where this lives: "Build your team" (AgentsView.vue), a BUILT-IN agent card

Same pattern as the four existing built-in agents — do NOT invent a new
subsystem. Study `src/server/built-in-agents.ts` before writing code; reuse
its conventions rather than reinventing them:

- **Types** (`src/core/types.ts:510-523`): `BuiltInAgentSchedule` ("daily" |
  "weekly" | "manual") and `BuiltInAgentConfig` (enabled, schedule,
  lastRunAt, cli, model) already generalize over any built-in agent — no
  schema change needed, just a new config key (suggest `"docs-debt"`,
  matching the existing `"tech-debt"` / `"performance"` / `"architect"` /
  `"design"` id style).
- **Scan → act → record pattern** (`src/server/built-in-agents.ts`): each
  agent has a `scanForX` function, an action function (`createXTasks` or
  `generateXReport`), a `runXAgent` that ties them together and records
  `lastRunAt` via `saveBuiltInAgentsConfig`, and a dispatch arm in
  `runBuiltInAgent` (`built-in-agents.ts:1489-1507`) keyed by the agent id
  string. Follow this shape for `scanForDocsDebt` / a fix-application step /
  `runDocsDebtAgent` / a new `if (name === "docs-debt")` arm.
- **Server wiring**: `src/server/server.ts:1410` and `:1895` call
  `runBuiltInAgent` for the schedule-driven and manual-trigger paths
  respectively — a new agent id needs no new route, just a dispatcher arm,
  UNLESS the response shape needs new fields for the UI message (see below).
- **UI card**: `AgentsView.vue:728-731` lists one `<BuiltInAgentCard
  agent="..." />` per built-in agent — add `<BuiltInAgentCard
  agent="docs-debt" />`. `BuiltInAgentCard.vue` hardcodes each agent's
  name/description/icon in an if-chain (~line 87-119) and a
  per-agent result-message branch (~line 217-225) — add both for
  `"docs-debt"`. Pick an icon distinct from the existing 🐞🔧⚡🏛🎨.
- Name it **"Docs Debt Agent"** in the UI (matches the "Tech Debt Agent" /
  "Performance Agent" naming convention already on the card list) — this is
  a naming decision, not open for the implementer to relitigate, but flag if
  a strong reason turns up not to.

## Decisions from PM interview (2026-09-15)

- **Verify claims against real code, don't just check internal
  consistency.** For each concrete, checkable claim in `AGENTS.md`, `docs/`,
  and `user-docs/` (a file path, a function/command name, a CLI flag, a
  stated constraint like "zero runtime dependencies"), actually check it —
  grep for the symbol/path, read the referenced file, run `--help` for a
  claimed flag. This is the rigor that would have caught #0343; a
  lighter-weight "flag stale-looking dates/TODOs" pass would have missed it.
  Bound the scan (file count, doc count, or time budget) the same way
  `scanForTechDebt`/`scanForPerformanceIssues` cap themselves
  (`MAX_SCAN_FILES` etc., `built-in-agents.ts:168-183`) — this must not
  become an unbounded, slow crawl of every doc against every file.
- **Auto-fix trivial drift directly; file exactly ONE task for everything
  else.** This is the one place this agent's behavior is genuinely new
  among the built-ins — every existing built-in agent is read-only (creates
  tasks or writes a report, never edits source). Getting the trivial/needs-
  human line right matters:
  - "Trivial" = a single, mechanical, high-confidence correction with
    concrete evidence: a renamed path where the old one 404s and the new
    one is unambiguous, a stale count/date, a dead link with one obvious
    live replacement. Apply directly to the doc file (docs/AGENTS.md/
    user-docs only — NEVER `src/`) and commit directly, with the specific
    evidence (what was checked, what was found) in the commit message.
    Cap how many trivial fixes land in one run (pick a conservative number,
    e.g. 5-10) so a bad run can't rewrite large swaths of the docs
    unsupervised — if the cap is hit, downgrade the rest to the task instead
    of silently dropping them.
  - "Needs human" = anything requiring judgment about intent (is this
    behavior change deliberate or drift? does this claim need a rewrite,
    not just a fact update? do two docs actually contradict, or is one
    scoped narrower than the other?). Do NOT file one task per finding —
    that produces the exact "10+ tasks per run" noise explicitly rejected
    in the interview. Bundle ALL needs-human findings from one run into a
    SINGLE task, one entry per finding with its location and evidence —
    mirror `createTechDebtTasks`'s existing grouped-task pattern
    (`built-in-agents.ts:551-620`, which already groups multiple issues
    into one task per type) but collapse to exactly one group
    ("docs-debt") regardless of category. If a run finds zero needs-human
    issues, create no task at all — don't file an empty/no-op task.
  - Task creation writes directly under `config.workDir` the same way
    `createTechDebtTasks` does (this is server-side code implementing the
    task-creation path itself, not an external caller that should go through
    `repoos new`/the HTTP API — same reasoning as the existing agents).
- **Trigger: both schedule and on-demand**, via the existing "Build your
  team" schedule dropdown (Manual only / Daily / Weekly) and Run now button
  — no new trigger mechanism needed, `BuiltInAgentSchedule` already covers
  this.

## Acceptance criteria

- [ ] `scanForDocsDebt` (or similar) verifies concrete claims in
      `AGENTS.md`/`docs/`/`user-docs/` against actual code/repo state, not
      just internal doc consistency, and is bounded (scan cap analogous to
      existing agents).
- [ ] A run applies trivial, mechanical fixes directly to doc files (never
      `src/`) and commits them, each with evidence in the commit message; a
      cap limits how many land per run.
- [ ] A run creates AT MOST ONE task per invocation, bundling every
      needs-human finding; zero such findings means zero tasks created.
- [ ] New built-in agent wired end to end: dispatcher arm in
      `runBuiltInAgent`, `BuiltInAgentCard` entry (name "Docs Debt Agent",
      description, icon, result message), `AgentsView.vue` card list,
      schedule + manual-trigger both work via existing mechanisms.
- [ ] Tests covering: claim verification catching a deliberately-introduced
      false claim (regression test for the #0343 failure mode), the
      trivial/needs-human classification boundary, the single-task-bundling
      behavior, and the trivial-fix cap — mirror existing test coverage for
      `scanForTechDebt`/`createTechDebtTasks`.
- [ ] `repoos check` passes.

## Related

- #0343 — the concrete failure mode this agent exists to catch on an
  ongoing basis, not just once.
- AGENTS.md commit 345acdad — the inline (per-task) half of this two-part
  strategy; this task is the periodic (whole-repo) half.

## Activity

- 2026-09-15T12:59:49Z · created · unknown
- 2026-09-15T14:21:28Z · model_override
- 2026-09-15T14:21:39Z · status inbox→ready
- 2026-09-15T15:41:48Z · review_model_override
