---
id: "0390"
title: Migrate the Docs Debt Agent to the skill-guided runner
type: feature
status: inbox
priority: p1
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-17T14:03:10Z"
updated_at: "2026-09-17T14:03:10Z"
---
## Problem

Depends on #0389 landing first (the shared skill-guided runner + deterministic auto-fix verification gate) — do not start this until that's done.

`scanForDocsDebt` (`src/server/built-in-agents.ts`) is pure regex/filesystem heuristics: no LLM call anywhere. Investigated live in this repo on 2026-09-17 by re-running it directly and diffing against the task it filed (#0388):

**Real findings it correctly caught** (verified by hand, still true right now):
- `docs/previews.md` and `docs/dogfooding-vs-general.md` both reference `` `ensureFreshBuild` `` — this function no longer exists anywhere in the repo (confirmed by grep). Real drift.
- `docs/previews.md` references `` `resolveServeEntry` `` — also gone; `src/server/preview.ts` now has `resolvePreviewTarget` instead. Real drift, and a plausible rename to point the doc at.
- Two trivial path-rename fixes it auto-applied were both correct and safe (`docs/mobile-architecture.md`: `src/reachability.ts` → `mobile/src/reachability.ts`; `AGENTS.md`: `tests/repo-store.test.ts` → `src/ui-app/tests/repo-store.test.ts`).

**False positives, three distinct causes, all confirmed by direct testing**:
1. `MAX_SCAN_FILES = 400` < this repo's actual `src/` file count (430) — `testTimeout`/`maxWorkers` genuinely exist in `src/ui-app/vite.config.ts` but got dropped from the scanned set. Non-deterministic which files get cut, since it depends on filesystem read order.
2. The scanner only walks `src/`, never `mobile/src/` — so `docs/mobile-architecture.md`'s claims about `openInWebView`/`openInSystemBrowser` (real functions, just in the mobile app) are guaranteed false positives.
3. No way to tell "a claim about RepoOS's own code" from "prose naming a third-party tool's convention" — `` `ignorePatterns` `` (oxfmt's config key), `` `oldString`/`newString` `` (Claude Code's own Edit-tool params, in a CLI-comparison table), `` `prepublishOnly` `` (npm's lifecycle hook) all false-positive.

Separately, the UI/plumbing around this agent has real gaps: the run result never surfaces which task got created (`createDocsDebtTask` computes a `taskId` locally but it never reaches `DocsDebtRunResult`, so the UI can't link to it even though it wants to), and the two auto-applied fixes are visible only in `git log` — never shown in the UI banner or the created task.

## Desired UX

- Replace `scanForDocsDebt`'s deterministic implementation with a call through #0389's shared runner, driven by a skill doc describing what "docs debt" means: verify concrete, checkable claims in `AGENTS.md`/`docs/`/`user-docs/` against the real repo — regardless of the project's language or layout — and distinguish claims about the project's own code from claims describing a third-party tool's own naming.
- Any fix the agent proposes only auto-commits to `main` if it clears #0389's `isSafeToAutoCommit` gate; everything else goes into the bundled findings task, same as today.
- The run result exposes the created task's id, and the UI (`BuiltInAgentCard.vue`) renders it as a clickable link in the result banner instead of a bare count.
- The run result also lists what was auto-fixed (doc + old→new), shown in the same banner — not left as something only visible via `git log`.

## Acceptance criteria

- [ ] A skill/guidance doc exists (e.g. `docs/agents/skills/docs-debt.md` — follow whatever convention #0389 establishes) describing the docs-debt concern in enough detail that the agent catches the two real gaps above (`ensureFreshBuild`, `resolveServeEntry`) without needing per-project hardcoded extension/path lists.
- [ ] Re-running the migrated agent against this repo does NOT reproduce any of the three false-positive classes above (spot-check: `testTimeout`/`maxWorkers`/`ignorePatterns`/`oldString`/`newString`/`prepublishOnly` should not be flagged).
- [ ] Re-running against a doc describing `mobile/` code correctly resolves symbols that live there, without a hardcoded `mobile/src` special case (the agent should figure out where source lives from the actual repo, not a constant).
- [ ] `DocsDebtRunResult` (or its replacement) carries the created task's id; the UI links to it.
- [ ] The UI shows what was auto-fixed (doc + change), not just a count.
- [ ] Auto-commit only happens through #0389's verification gate — no path where the agent's own output authorizes a write to `main` without that gate passing.
- [ ] `repoos check` passes.

## Notes for AI

- Depends on #0389. Read that task's "Desired design" section for the runner/gate interfaces before starting.
- The existing `DocsDebtScanResult`/`DocsDebtFinding`/`DocsDebtTrivialFix` types in `src/server/built-in-agents.ts` are a reasonable target shape to keep producing, even though how they're populated changes completely.
- `createDocsDebtTask`'s "bundle everything into ONE task" behavior (not one task per finding) is deliberate — keep it; it avoids flooding the inbox.
- Background: #0388 (the task this investigation itself produced — read its findings, then treat it as historical once this migration lands and can be re-run for real), #0354 (this agent's original build), #0243 (the sibling task this was split from).

## Activity

- 2026-09-17T14:03:10Z · created · unknown
