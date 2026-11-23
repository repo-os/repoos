---
task: "1277"
pass: 9
at: "2026-11-22T16:48:05.212Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/hide-the-stale-evidence-prompt-once-a-ta
state: ok
tree_identity: "c43000b1a:eca368994b"
---
## Verdict
`needs some work` — implementation matches the spec; handoff capture is `STALE-EVIDENCE-ONLY` (tree `eca368994b`, HEAD `3ae4cd54e`; HEAD only drops fixture `#9998` handoff fetches).

## Relevance
`still relevant` — review cards and drawers still need this close-out gate on main.

## Evidence
None

## Bugs

None found
No further findings of this class were found after grepping: `integrationEvidencePromptHidden` and TaskCard/TaskDrawer callers, `refreshTaskEvidence` and both automatic evidence-refresh paths, `taskCloseOutPending` / `closeOutQueued` wiring in `server.ts`, and related server/UI tests.
- Browser verification: Handoff browser verification recorded 2 blocking issue(s): [request] HTTP 404 for http://127.0.0.1:33135/api/tasks/9998/handoff-status; [request] Failed to load resource: the server responded with a status of 404 (Not Found)
## Edge cases
Pass 1–2 **Queued close-out verify guard** is fixed: `taskCloseOutPending` on verify plus `closeOutQueued` on automatic refresh paths. `integrationEvidencePromptHidden` hides on queue membership or any non-failed active phase; failed active jobs show the prompt again. Drawer queued-state coverage was added since pass 4. Engineering report source commit predates HEAD (docs + fixture tweak only). Landing checklist: task-file merge conflict and dirty `repoos.toml` on main are environmental, not this diff.

## Suggestions (non-blocking)
Re-capture on `3ae4cd54e` so handoff evidence matches HEAD and drops the `#9998` handoff-status 404s. `keepReviewVerdict` still gates only on `closingOut()`, not queued jobs (verdict re-pin, not evidence refresh).

## Automated verification

- Browser console-error check (handoff evidence): **failed** — Handoff browser verification recorded 2 blocking issue(s): [request] HTTP 404 for http://127.0.0.1:33135/api/tasks/9998/handoff-status; [request] Failed to load resource: the server responded with a status of 404 (Not Found)
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

