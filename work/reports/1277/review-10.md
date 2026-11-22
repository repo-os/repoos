---
task: "1277"
pass: 10
at: "2026-11-22T19:00:00.434Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/hide-the-stale-evidence-prompt-once-a-ta
state: ok
tree_identity: "c7d822b32:c7d822b32a"
---
Repeated review classes: Passes 1–2 found **Queued close-out verify guard** (verify and automatic refresh ignored a per-task queued job) — fixed with `taskCloseOutPending` and `closeOutQueued`. Passes 3–4 found **Evidence capture quality** (validating fixture, integration popover hiding the footer) — fixed via `card:staleEvidenceQueued` and a collapsed integration bar. Pass 9 found **Fixture HTTP noise** (`#9998` handoff-status 404) — fixed with an empty fixture branch. Those classes look resolved on HEAD `59114a8`; the human may want to note how often review churned on guards and capture rather than card logic.

## Verdict
`good to go` — shared UI gate, per-task server refusal, and tests satisfy the spec; handoff shows queued #9999 without stale-evidence UI.

## Relevance
`still relevant` — main still shows the stale-evidence prompt during queued close-out without this branch.

## Evidence
None

## Bugs
None found
No further findings of this class were found after grepping: `integrationEvidencePromptHidden`, TaskCard/TaskDrawer callers, `refreshTaskEvidence`, `automaticStaleEvidenceRefresh`, `automaticEvidenceGapRepair`, `taskCloseOutPending`, `server.ts` wiring, shot fixtures, and related tests.

## Edge cases
`taskCloseOutPending` scopes queue blocking to the task owning the job (not repo-wide `closeOutPending`). Failed active jobs drop out of `integrationPipelineRole`, so the prompt returns. Landing checklist: task-file-only merge conflict (close-out heals) and uncommitted `repoos.toml` on main block Move to done until a human cleans main — not this diff.

## Suggestions (non-blocking)
`keepReviewVerdict` still keys off the global close-out lock only; queued jobs may still re-pin verdict text — separate from evidence refresh, worth a follow-up if noisy.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-22T18:59:12.715Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

