---
id: "0326"
title: Remove the decommissioned screenshots/ fixture subsystem
type: chore
status: inbox
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-04T03:30:08Z"
updated_at: "2026-09-04T03:30:08Z"
---
## Context

The `screenshots/` committed visual-fixture system is defunct. History was
rewritten to purge ~250 MiB of stale PNG churn (2026-09-04), `screenshots/`
is gitignored, `src/commands/screenshots.ts` is already dead code (nothing
imports it; `repoos screenshots` is not wired into `src/cli/index.ts`), and
no staleness check references it in `repoos check`. What remains is inert
special-casing scattered through safety-critical merge code, plus an orphaned
capture pipeline and stale comments/tests.

**Nothing is broken** — a leftover `screenshots/` in a path-exclusion list or
`autoResolve` array simply matches nothing. This is hygiene, not a bug fix.
But it touches the close-out / merge-to-main path, so it needs a worktree,
full `repoos check`, and review — not a hotfix.

## Scope

Remove every `screenshots/` reference and the orphaned pipeline. Do NOT touch
the parallel `dist/` handling on the same lines — `dist/` is still generated
and its special-casing stays.

**Dead code / pipeline:**
- [ ] Delete `src/commands/screenshots.ts` (unused) and its test if any.
- [ ] Delete `scripts/capture-screenshots.mjs` and `scripts/screenshot-fixtures/`.
- [ ] Remove the `"screenshots"` script from `package.json`.
- [ ] Remove `screenshots/` from `.gitignore` (nothing generates it anymore)
      — or keep one line if `bun run build`-adjacent tooling still could.
- [ ] `src/commands/ui-harness.ts` header comment referencing the screenshots run.

**Merge / review / gc machinery — drop only the `screenshots` token, keep `dist`:**
- [ ] `src/core/git.ts` — `DIFF_SOURCE_PATHS` (`:(exclude)screenshots`),
      `agentTouchedFiles` (filter + doc comment, ~L1481/1490/1496).
- [ ] `src/core/worktree-gc.ts` — `:(exclude)screenshots` in the status args
      (~L90) and the "routinely committed on a branch" comment (~L82).
- [ ] `src/server/review-guard.ts` — the `screenshots/` branch in the
      non-substantive-path check (~L54/55), the `reset` args (~L134), header
      comment (~L12).
- [ ] `src/server/integration-orchestrator.ts` — `"screenshots/"` in
      `autoResolve` (~L701) + comment (~L684).
- [ ] `src/server/done.ts` — remove `"screenshots/"` from `autoResolve`
      (~L511); in the "drop before merge" step (~L500-509) narrow the
      `ls-files` / `rm --cached` / commit message to `dist/` only; fix the
      comments at ~L353-354 and ~L500-502.
- [ ] `src/server/handoff.ts` — comment at ~L523.
- [ ] `src/server/agents.ts` — the agent-instruction string at ~L1898
      ("never `dist/` or `screenshots/`" → "never `dist/`").
- [ ] `src/server/system.ts` — comment at ~L87 (list of gitignored dirs).
- [ ] `src/server/write.ts` — `changes.push("screenshots")` at ~L210 if it's
      now unreachable (verify — this may be the task-body `## Screenshots`
      section from attachments, which is a DIFFERENT feature and must stay).

**Tests:**
- [ ] `src/ui-app/tests/handoff.test.ts` (~L155/177),
      `git-worktree.test.ts` (~L489/533),
      `agent-drivers.test.ts` (~L643) — drop the `screenshots/` expectations.
- [ ] `check-task-assets.test.ts` uses `screenshots/dashboard.png` as an
      "allowed elsewhere" example — fine to keep or swap for `docs/`.

**Docs:**
- [ ] `docs/close-out-pipeline.md` (autoResolve list, troubleshooting rows),
      `docs/dogfooding-vs-general.md`, `docs/audits/2026-08-agent-skill-gap-audit.md`,
      and any `AGENTS.md` mention — update or drop the `screenshots/` references.
- [ ] Grep the whole tree for `screenshots` one more time before review.

## Acceptance criteria

- [ ] `grep -rn "screenshots/" src/ docs/` returns only the task-attachment
      feature (`## Screenshots` body section, `SCREENSHOT_MIME`, etc.) — nothing
      about a committed `screenshots/` directory.
- [ ] `repoos check` green, including the merge-machinery tests.
- [ ] `dist/` handling is byte-for-byte unchanged everywhere it was shared.
- [ ] A close-out still merges cleanly (exercise `done.ts` / orchestrator via
      their existing tests).
- [ ] `bun run` has no dangling `screenshots` script; no dead file left under
      `scripts/` or `src/commands/`.

## Notes

- The task/input *attachment* feature (`src/server/attachments.ts`,
  `src/server/routes/inputs.ts`, `work/.attachments/`, `## Screenshots` body
  section) is unrelated and must be left intact — it's the thing that
  *replaced* committed screenshots.
- Prior context: commit that purged history + added the `task-assets` guard,
  same session.

## Activity

- 2026-09-04T03:30:08Z · created · unknown
