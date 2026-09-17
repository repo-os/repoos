---
id: "0389"
title: Build the shared skill-guided built-in-agent runner and the deterministic auto-fix verification gate
type: feature
status: active
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/build-the-shared-skill-guided-built-in-a
model_override: openrouter/xiaomi/mimo-v2.5
created_at: "2026-09-17T14:02:47Z"
updated_at: "2026-09-17T14:54:45Z"
review_rounds: 2
review_passes: 2
handoff_signal_retry_count: 1
---
## Problem

All five "Build your team" built-in agents (Tech Debt, Performance, Architect, Design, Docs Debt — `src/server/built-in-agents.ts`) are 100% deterministic static analysis today: regex over file contents, hardcoded file-extension lists, hardcoded scan roots. There is no LLM call anywhere in this file (confirmed by grep — no `runPrompt`/`AgentRunner` import). Yet every one of their UI cards shows a "Coding agent + Model" picker, implying they're AI-driven like the PM/Engineer/Reviewer/Debugger/CTO agents actually are. This is both misleading and a real capability gap:

- **Doesn't generalize.** `SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".vue"]` is shared by Tech Debt/Performance/Architect/Docs Debt — a Python, Go, or Rust project managed by RepoOS gets ~0 files matched and the agent reports "no issues found," which reads as a clean bill of health rather than "this tool can't see your code." Design is worse: it's hardcoded to the literal path `src/ui-app/src` and Vue-only file filters — RepoOS's own frontend, by name. Any other project gets nothing.
  Verified live in this repo, 2026-09-17: re-ran `scanForDocsDebt` directly and found real false positives from this exact class of bug — `testTimeout`/`maxWorkers` genuinely exist in `src/ui-app/vite.config.ts` but were flagged as missing symbols because `MAX_SCAN_FILES = 400` is smaller than this repo's own 430-file `src/` tree, and which ~30 files get silently dropped is non-deterministic (depends on filesystem read order).
- **False positives that no exclusion list can fully catch.** Doc claims like `` `ignorePatterns` `` (oxfmt's own config key), `` `oldString`/`newString` `` (Claude Code's own Edit-tool parameter names, being discussed in a comparison table), `` `prepublishOnly` `` (npm's own lifecycle hook) all get flagged as "missing RepoOS symbols" because the regex classifier (`isSymbolClaim` in `built-in-agents.ts`) has no way to distinguish "a claim about this project's own code" from "prose mentioning another tool's naming convention." That's a semantic judgment, not a pattern match.
- **#0243** ("Convert deterministic built-in scanners into configurable AI agents") already identified the first problem for 4 of these 5 agents and proposed converting them to real AI agents with configurable CLI/model. It's sound in direction but has failed twice as one large task (watchdog-stuck: agent exited without the handoff signal; then a monthly model quota error mid-run) and didn't include Docs Debt (added later, in #0354) or the auto-fix safety design below. Superseded by this task plus the per-agent migration tasks that follow it.

## Desired design

Each agent becomes a real agent run — same underlying mechanism as PM/Reviewer/Debugger (`AgentRunner`/`runPrompt`), not a bespoke new invocation path — driven by a skill/guidance doc describing what that agent's concern actually means (what "docs debt" means, what "tech debt" means, etc.), given the real repo as context (file tree, relevant manifests/docs), producing the same structured finding shape the deterministic scanners return today so task-creation and the UI barely have to change.

**The one piece that must stay deterministic, and why:** Docs Debt today auto-commits some fixes straight to `main` with no human review — but only when a fix clears a hard, independently-checkable precondition (today: exactly one file in the whole repo shares the missing path's basename). That precondition is *why* it's safe to skip review — it's a fact, not a judgment call. An AI-proposed fix must clear the same kind of independent, script-checkable gate before it's allowed to auto-commit; the AI's own stated confidence must never be what authorizes an unreviewed write to `main`. Concretely:

```ts
interface ProposedFix {
  doc: string;
  oldText: string;
  newText: string;
}

// No model call in here — re-verifies the AI's claim independently.
function isSafeToAutoCommit(fix: ProposedFix, repoRoot: string): boolean {
  if (!docCurrentlyContains(fix.doc, fix.oldText)) return false; // claim is stale
  if (!repoActuallyContains(repoRoot, fix.newText)) return false; // claim is wrong
  return true;
}
```

If a proposed fix doesn't clear this, it goes into the findings/report bundle for a human — the agent never gets to skip that by being confident. This gate is the ONE thing every migrated agent shares and must not bypass; everything else (finding issues, judging severity, writing the fix, writing the report) is the agent thinking, not a scanner counting regex matches.

## Scope (this task only — NOT migrating any individual agent yet)

- [ ] A shared runner function/module that: takes an agent id, a skill/guidance doc path, and repo context; invokes the configured CLI/model (reusing the existing `builtInAgents` config shape — enabled/schedule/cli/model — which already exists per-agent and is currently unused); returns structured findings in a shape compatible with today's `TrivialFix`/`Finding`-style types so downstream task-creation code doesn't need to change per-agent.
- [ ] The `isSafeToAutoCommit`-style verification gate as its own small, independently unit-tested module — accepts a proposed fix + repo root, returns a boolean, no model call inside it.
- [ ] Every LLM call site must record its usage per AGENTS.md — call `recordOneShotSession(repoRoot, agent, result, { sessionType, taskId })` from `src/server/agents.ts` immediately after the run, with a `sessionType` that keeps the Tokens tab's by-role breakdown legible (not lumped under `pm`/`dispatch`).
- [ ] Actionable failure surfacing: model/connector failures (the quota-exceeded and missing-handoff-signal failure modes that killed #0243's attempts) must identify the affected agent and route back to its settings — do not let a failed run silently disappear or leave the agent stuck.
- [ ] Existing `builtInAgents` config (enabled/schedule/cli/model/lastRunAt) must keep working unchanged — this task only builds the mechanism; it doesn't migrate any agent onto it yet.
- [ ] Unit tests for the verification gate (true/false cases: stale claim, wrong claim, both correct) and for the runner's plumbing (mocked agent response → correctly shaped findings).
- [ ] `repoos check` passes.

## Notes for AI

- Do NOT migrate Tech Debt, Performance, Architect, Design, or Docs Debt in this task — that's five separate follow-up tasks, each depending on this one landing first. This task is infrastructure only.
- Reuse `AgentRunner`/`runPrompt` and the existing `builtInAgents` config schema (`src/core/types.ts`) — do not invent a parallel agent-invocation mechanism.
- Read `src/server/built-in-agents.ts` in full first — the existing `DocsDebtFinding`/`DocsDebtTrivialFix`/etc. types are a reasonable model for the shape the new runner's output should be compatible with, even though the migration tasks will eventually replace how those get populated.
- Background/context: #0243 (superseded by this task and its siblings), #0354 (the Docs Debt Agent this whole investigation started from).

## Activity

- 2026-09-17T14:02:47Z · created · unknown
- 2026-09-17T14:12:08Z · model_override
- 2026-09-17T14:12:08Z · status inbox→ready
- 2026-09-17T14:12:14Z · status ready→active, branch
- 2026-09-17T14:39:49Z · status active→review
- 2026-09-17T14:40:49Z · status review→active
- 2026-09-17T14:47:35Z · status active→review
- 2026-09-17T14:54:45Z · status review→active
