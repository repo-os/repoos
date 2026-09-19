---
id: "0428"
title: "Close-out failure reasons must name the failing check, not the output tail"
type: bug
status: ready
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
review_model_override: opencode-go/mimo-v2.5
created_at: "2026-09-18T18:29:57Z"
updated_at: "2026-09-19T00:46:51Z"
---
## Problem

When close-out's gate fails, the recorded failure reason is only the last few hundred characters of the check output. On 2026-09-18 #0423 and #0425 both failed because main itself failed `oxfmt --check` (a hand commit left a stray blank line in `src/ui-app/src/style.css`). The saved reason in `.repoos/integration-jobs/0425.json` was the tail of the test run instead: Vue custom-element warnings, init-scaffold and auth-invite stderr, and a `[global-reap]` notice. The formatting failure never appeared, the full output wasn't saved anywhere, and the retry's differing tail led close-out to blame "machine load or infrastructure". Finding the real cause took reproducing the whole candidate by hand.

## Acceptance criteria

- [ ] The failure reason leads with the check's own **Results** summary: which checks failed (e.g. `✗ check-fmt:check`, `✗ tests`), plus the key detail for each (the files with format issues, the `FAIL` test names).
- [ ] The complete check output for a failed close-out is saved to a durable log file (e.g. `.repoos/logs/integration/<id>-<attempt>.log`) and referenced from the job record and the task UI.
- [ ] Checks skipped because an earlier one failed (`build — skipped — formatting/lint failed`) are shown as skipped, not as passed or as a separate root cause.
- [ ] The "two unrelated failures → machine load" heuristic compares the failed-check lists, not raw output tails, so a deterministic failure (same failing checks both times) is never reported as infrastructure.
- [ ] Test: a gate run with a formatting failure plus noisy test stderr yields a reason that names `check-fmt:check` and the file.

## Activity

- 2026-09-18T18:29:57Z · created · unknown
- 2026-09-19T00:46:38Z · cli_override
- 2026-09-19T00:46:42Z · model_override
- 2026-09-19T00:46:49Z · review_model_override
- 2026-09-19T00:46:51Z · status inbox→ready
