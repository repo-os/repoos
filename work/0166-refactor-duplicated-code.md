---
id: "0166"
title: "Refactor duplicated code"
type: chore
status: inbox
priority: p2
area: tech-debt
assigned_to: unassigned
created_by: tech-debt-agent
created_at: "2026-08-13T13:45:29.814Z"
updated_at: "2026-08-13T13:45:29.814Z"
---
## Issues Identified

### Identical 6-line block also found in `src/core/models.ts`:93 — extract it into a shared helper ("}; | const timer = setTimeout(() => { | try {…")
- **File**: `src/core/detect.ts`
- **Line**: 221
- **Severity**: low

### Identical 6-line block also found in `src/core/models.ts`:94, `src/server/agents.ts`:1417 — extract it into a shared helper ("const timer = setTimeout(() => { | try { | proc.kill("SIGKILL");…")
- **File**: `src/core/detect.ts`
- **Line**: 223
- **Severity**: low

### Identical 6-line block also found in `src/server/live-index.ts`:18 — extract it into a shared helper ("import { | isGitRepo, | localBranches,…")
- **File**: `src/core/indexer.ts`
- **Line**: 29
- **Severity**: low

### Identical 6-line block also found in `src/server/live-index.ts`:19 — extract it into a shared helper ("isGitRepo, | localBranches, | lastCommitForFile,…")
- **File**: `src/core/indexer.ts`
- **Line**: 30
- **Severity**: low

### Identical 6-line block also found in `src/server/live-index.ts`:96 — extract it into a shared helper ("function priorityRank(p: string): number { | const i = (PRIORITIES as readonly string[]).indexOf(p); | return i === -1 ? PRIORITIES.length : i;…")
- **File**: `src/core/indexer.ts`
- **Line**: 55
- **Severity**: low

### Identical 6-line block also found in `src/server/live-index.ts`:97 — extract it into a shared helper ("const i = (PRIORITIES as readonly string[]).indexOf(p); | return i === -1 ? PRIORITIES.length : i; | }…")
- **File**: `src/core/indexer.ts`
- **Line**: 56
- **Severity**: low

### Identical 6-line block also found in `src/server/live-index.ts`:177 — extract it into a shared helper ("lastCommit: subject, | lastCommitAt: date, | worktreePath: wt.path,…")
- **File**: `src/core/indexer.ts`
- **Line**: 98
- **Severity**: low

### Identical 6-line block also found in `src/server/live-index.ts`:254 — extract it into a shared helper ("const s = statusRank(a.status) - statusRank(b.status); | if (s !== 0) return s; | const p = priorityRank(a.priority) - priorityRank(b.priority);…")
- **File**: `src/core/indexer.ts`
- **Line**: 114
- **Severity**: low

### Identical 6-line block also found in `src/server/server.ts`:337 — extract it into a shared helper ("for (const e of readdirSync(dir)) { | if (e.startsWith(".")) continue; | const full = join(dir, e);…")
- **File**: `src/core/context-pack.ts`
- **Line**: 288
- **Severity**: low

### Identical 6-line block also found in `src/ui-app/src/types.ts`:32 — extract it into a shared helper ("assignedTo: string; | createdBy: string; | branch: string;…")
- **File**: `src/core/types.ts`
- **Line**: 80
- **Severity**: low

### Identical 6-line block also found in `src/ui-app/src/types.ts`:43 — extract it into a shared helper ("extra: Record<string, unknown>; | /** Per-task agent name override, or null when using the default. */ | agentOverride: string | null;…")
- **File**: `src/core/types.ts`
- **Line**: 96
- **Severity**: low

### Identical 6-line block also found in `src/ui-app/src/types.ts`:44 — extract it into a shared helper ("/** Per-task agent name override, or null when using the default. */ | agentOverride: string | null; | /** Per-task CLI override, or null when using the agent's default. */…")
- **File**: `src/core/types.ts`
- **Line**: 97
- **Severity**: low

### Identical 6-line block also found in `src/ui-app/src/types.ts`:165 — extract it into a shared helper ("* fabricated zero. | */ | export interface AgentSessionStats {…")
- **File**: `src/core/types.ts`
- **Line**: 177
- **Severity**: low

### Identical 6-line block also found in `src/ui-app/src/types.ts`:166 — extract it into a shared helper ("*/ | export interface AgentSessionStats { | /** Cumulative ms across completed turns — excludes any turn in flight. */…")
- **File**: `src/core/types.ts`
- **Line**: 178
- **Severity**: low

### Identical 6-line block also found in `src/ui-app/src/types.ts`:167 — extract it into a shared helper ("export interface AgentSessionStats { | /** Cumulative ms across completed turns — excludes any turn in flight. */ | accumulatedMs: number;…")
- **File**: `src/core/types.ts`
- **Line**: 179
- **Severity**: low

### Identical 6-line block also found in `src/ui-app/src/types.ts`:168 — extract it into a shared helper ("/** Cumulative ms across completed turns — excludes any turn in flight. */ | accumulatedMs: number; | /** ISO timestamp the current turn started, or null when no turn is running. */…")
- **File**: `src/core/types.ts`
- **Line**: 180
- **Severity**: low

### Identical 6-line block also found in `src/ui-app/src/types.ts`:169 — extract it into a shared helper ("accumulatedMs: number; | /** ISO timestamp the current turn started, or null when no turn is running. */ | turnStartedAt: string | null;…")
- **File**: `src/core/types.ts`
- **Line**: 181
- **Severity**: low

### Identical 6-line block also found in `src/ui-app/src/types.ts`:170 — extract it into a shared helper ("/** ISO timestamp the current turn started, or null when no turn is running. */ | turnStartedAt: string | null; | /** ISO timestamp of the most recent agent.output line, or null until first output. */…")
- **File**: `src/core/types.ts`
- **Line**: 182
- **Severity**: low

### Identical 6-line block also found in `src/ui-app/src/types.ts`:171 — extract it into a shared helper ("turnStartedAt: string | null; | /** ISO timestamp of the most recent agent.output line, or null until first output. */ | lastOutputAt: string | null;…")
- **File**: `src/core/types.ts`
- **Line**: 183
- **Severity**: low

### Identical 6-line block also found in `src/ui-app/src/types.ts`:172 — extract it into a shared helper ("/** ISO timestamp of the most recent agent.output line, or null until first output. */ | lastOutputAt: string | null; | /** Best-effort cumulative token count reported by the CLI, or null if never reported. */…")
- **File**: `src/core/types.ts`
- **Line**: 184
- **Severity**: low

## Next Steps

1. Review each issue in the files listed above
2. Make the suggested improvements
3. Test the changes thoroughly
4. Move this task to done when complete
