# Evidence-only review gaps (#0831)

When the reviewer finds the **code** acceptable but **handoff evidence** (shots,
ui-verification JSON, or declared capture plan) is missing or unusable, that
outcome must not behave like a code defect.

## Problem

A `needs some work` verdict for evidence alone used to increment
`review_rounds`, auto-bounce the engineer, and eventually set
`review-rounds-exhausted` even though there was nothing to fix in the branch.

## Decision

1. **Separate marker** — The reviewer keeps the normal three verdict labels for
   code. When the *only* blocker is evidence (not stale captures — those keep
   `STALE-EVIDENCE-ONLY` from #0766), it adds `EVIDENCE-GAP-ONLY` in the
   `## Verdict` section and lists what is missing under `## Evidence`.

2. **No engineer round** — `EVIDENCE-GAP-ONLY` skips auto-bounce and does not
   increment `review_rounds`. The task stays in `review`.

3. **Automatic repair** — RepoOS runs the same guarded re-capture as
   **Refresh evidence** (`guardedForceRefreshCapture`). On success it starts one
   new review. Unlike stale-only auto-refresh (#0772), this path is always
   enabled when the marker is present.

4. **Escalation** — After `MAX_EVIDENCE_GAP_REPAIR_ATTEMPTS` (2) repair cycles
   that still end in `EVIDENCE-GAP-ONLY` or fail to capture, the task is flagged
   `needs_input` with reason `evidence-gap-exhausted` and `needs_input_detail`
   taken from the reviewer's `## Evidence` section.

Code findings are unchanged: they still auto-bounce and count toward
`MAX_AUTO_REVIEW_ROUNDS`.
