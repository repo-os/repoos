## TL;DR

Task #1073 shipped a release dialog that shows the install-specific upgrade command, supports copying it, and remembers dismissed versions. Final verdict: **good to go**.

## Outcome

`GET /api/release/available` now returns the install kind and upgrade command, using detection shared with `repoos upgrade`. The dialog shows the command and copy feedback, labels the GitHub link “Release notes,” and explains that upgrading runs in a terminal and the running server keeps its current version until restarted. Dismissal persists per available version. The task merged as `2f931dd8f1e355ab6ce63130ed6b5a3026b197a4`.

The final review verdict was **good to go**.

## Process stats

- Development rounds: 3 recorded. Review passes: 7.
- Wall-clock from task creation to done: 1 day, 7 hours, 12 minutes, 37 seconds.
- Engineer: opencode with DeepSeek-V4.1-Flash; later Claude Code with Haiku. Recorded session totals: 471,487 tokens and 1.729198676 cost units. The initial engineer session errored; the Haiku session finished.
- Reviewer: Claude Code with Haiku across the recorded review sessions. Totals: 84,789 tokens and 0.20648342 cost units.
- Routing and debugger sessions also occurred; aggregate token and cost totals for those roles are not recorded. Several debugger sessions errored, including sessions blocked by missing GitHub authentication and one timeout.

## What went wrong

- The engineer crashed and was restarted several times. GitHub Copilot debugger attempts also errored or timed out. The implementation was resumed, and later work continued with Claude Code.
- Handoff verification repeatedly failed because the preview fixture did not open the dialog reliably, shots became stale, the report exceeded the narrative limit, and a report draft was missing. The fixture was made reactive and the report was corrected; later captures passed.
- Checks failed on a route-test version assertion and a stale `readVersion` reference. The assertion was removed because it tracked the moving build version rather than install detection, and the reference was corrected.
- A Vite production build and a later check failed during handoff. A scoped check subsequently passed; the cause of the earlier Vite failure was not found.
- Review found install detection and beta release comparison mismatches, plus copy-feedback edge cases. These were corrected and covered before final approval.
- A serialized check wait exceeded the handoff deadline, and one report finalization collided with a running check. The check later recovered; the final close-out gate completed successfully.

## Learnings

- Keep install-kind detection and upgrade command generation in one shared helper so the CLI and server stay aligned. The task’s scope boundary says #1072 will reuse it.
- Preview fixtures can race app health and live data. The reactive fixture pin and health watcher address this case; carry the pattern forward in `docs/previews.md`.
- Channel-specific commands must compare against releases on that same channel. The availability response and its offline fallback both need the same install information.
- Test install detection independently of a version that changes with the build.

## Follow-ups

- #1072 — dependent task to notify users about newer releases through the CLI and dashboard.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
