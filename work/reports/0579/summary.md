---
id: summary
title: summary
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: ""
---
## TL;DR

Task 0579 wired Apple notarization, ticket stapling, and post-staple verification into the existing `release` job in `.github/workflows/macos-hub.yml`, completing the macOS Hub distribution path. The signed `RepoOSHub.dmg` is now submitted to Apple's notary service with `--wait --timeout 1800 --output-format json` after packaging and the DMG install-experience check, and before any GitHub Release upload. A rejected submission or wait timeout fails the job and fetches `notarytool log` with the same authentication options when Apple returned a submission ID; failure before an ID preserves the original error and reports that no log is available. Only an `Accepted` submission reaches `stapler staple`, `stapler validate`, and `spctl --assess`; the upload step runs only after every gate passes. A new `dry_run` `workflow_dispatch` input exercises the whole pipeline without creating or modifying a release. `docs/macos-hub-release.md` was rewritten to stop claiming the DMG is ad-hoc signed with an expected Gatekeeper warning, and now documents the secret names, gate order, dry run, release checklist, and failure triage. The reviewer returned `good to go` on the first pass; the close-out gate completed in 571s and the task landed at commit `a3d055574824b1a79170da6658574d1ec181d864`. Notarization could not be exercised end-to-end because the prerequisite tasks (#0576 credentials, #0577 hardened runtime, #0578 Developer ID signing) were not landed; the engineer validated the shell branches locally against stubbed `xcrun`/`spctl` instead, and the gate is intentionally fail-closed until those land.

## Outcome

What shipped (diff: `.github/workflows/macos-hub.yml` +113/−0, `docs/macos-hub-release.md` +81/−22):

- **A single new workflow step, `Notarize, staple and verify DMG`, inserted into the existing `release` job** between the DMG install-experience check and `Determine channel`/`Upload DMG to GitHub Release`. One step was chosen deliberately over separate submit/log/staple/verify steps: the authentication arguments must be identical for submission and log retrieval, and a single shell scope makes "same authentication options" a guarantee rather than a convention, while making it structurally impossible for a failure path to reach stapling.
- **Credential resolution** following the runbook's existing contract: if any of `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID` is present all three are required and the API-key path wins; otherwise `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are required. An incomplete set fails immediately, naming the missing variables. The API `.p8` key is written only to `$RUNNER_TEMP`, chmodded, and removed in a trap; no secret value is echoed.
- **Submission and diagnostics:** `xcrun notarytool submit RepoOSHub.dmg` with `--wait`, `--timeout 1800`, `--output-format json`, piped through `tee` under `set -euo pipefail` so a rejected submission cannot be masked by `tee`'s success. `id` and `status` are parsed with `jq` and also written to the job summary. If an ID exists but the status is not `Accepted`, the ID is printed and `notarytool log "$ID"` is fetched with the same auth args; if submission failed before returning an ID, the original nonzero exit is preserved and the step reports that no Apple log is available.
- **Verification gates:** `stapler staple`, `stapler validate`, and `spctl --assess --type open --context context:primary-signature` run as plain fatal commands under `set -e` — no `|| true`, no fallback to uploading a pre-stapling copy.
- **A non-publishing dry run:** a `dry_run` `workflow_dispatch` input gates only the upload step (`if: ${{ inputs.dry_run != 'true' }}`); tag pushes are unaffected. The comparison is a string comparison because `workflow_dispatch` inputs can arrive as strings even when declared boolean — a boolean comparison could silently fail open. The dry run still requires real credentials and runs full notarization; it never creates or modifies a release.
- **Runbook correction:** `docs/macos-hub-release.md` previously contained contradictory claims (DMG ad-hoc signed and not notarized; Gatekeeper warning "expected"). It now documents the automated submit/wait/log/staple/validate/assess sequence, the exact secret names and precedence, the dry-run path and prerequisites, a release-checklist item confirming notarization and stapling before publication, and triage for rejection, timeout, post-submission file drift, and incomplete secrets.

**Final verdict:** review pass 1 returned `good to go` (first pass, no bugs found, no fixes requested). The task is `done`, release `success`.

## Process stats

- **Development rounds:** 1 (a single engineering round on 2026-11-15).
- **Review rounds:** 1 pass, verdict `good to go`, no change requests.
- **Wall clock, created → done:** 48 days 3h 39m (2026-09-28T18:43:47Z → 2026-11-15T22:22:57Z). Nearly all of that was waiting on prerequisites and task-body refinement; active engineering took one session of 594s (from status `ready→active` at 21:28:16Z to `active→review` at 21:43:52Z on 2026-11-15).
- **Agents and models per role:**
- Engineer: `opencode-go/deepseek-v4.1-flash` (OpenCode), 1 session, 594s, 123,202 tokens, $0.051496662.
- Reviewer: `composer-2.5` (cursor), 1 session, 58s, tokens/cost not recorded.
- PM: `opencode-go/deepseek-v4.1-flash`, 2 sessions — 2026-10-05 (205s, 69,506 tokens, $0.020396892) and 2026-10-07 (53s, tokens/cost not recorded) — used to refine the task body and acceptance criteria.
- Routing: Model router (openrouter), model not recorded, 2 sessions of 1s each.
- Restarts or model swaps: none recorded.
- **Token/cost totals (where recorded):** 192,708 tokens and $0.071893554 across the two sessions that recorded usage; the reviewer and the 2026-10-07 PM session did not record figures.
- **Close-out gate:** completed in 571s.
- **Shots:** skipped — the diff touches no capture target's globs (no UI change), which is consistent with the task's "no UI change" intent.

## What went wrong

- **The task sat for ~6.5 weeks before being picked up.** Created 2026-09-28, it entered `ready` on 2026-09-29 and accumulated multiple `needs_input` events (2026-10-05 ×2, 2026-10-06, 2026-10-07 ×3) while the task body, acceptance criteria, and AI notes were iteratively refined through 2026-10-07. It then remained `ready` until 2026-11-15. Resolution: normal refinement flow; no defect, but it shows this slice waited on its dependency chain (#0576/#0577/#0578).
- **First engineer turn ended without a handoff** (2026-11-15T21:37:02Z): the turn exited cleanly with code 0 without requesting review; its last message was "Waiting for the scoped check to complete before requesting handoff." Resolution: work continued in a follow-up turn; after a final body update the task moved `active→review` at 21:43:52Z with a queued message, and review proceeded normally.
- **`repoos check` side effects during the round:** the scoped check created a WIP checkpoint mid-run and left the edited files read-only, so a follow-up one-line workflow edit initially failed. Resolution: the engineer restored write permission, reapplied the change, and ran the final scoped check on the settled tree.
- **Notarization could not be exercised against Apple.** #0576 (credentials), #0577 (hardened runtime/entitlements), and #0578 (Developer ID signing) are not landed, and the release job still ad-hoc signs (`CODE_SIGN_IDENTITY="-"`). This was resolved by design, not workaround: the engineer validated the workflow's shell branches locally with stubbed `xcrun`, `spctl`, and submission JSON (covering missing credentials, accepted, rejected, timeout, and failure-before-ID paths) using real `jq` and `bash -n`. The reviewer flagged the same gap as an intentional fail-closed edge case: until the prerequisites land, notarization will fail and block upload — which is the required behavior, not a regression. No end-to-end proof exists and none was claimed.
- **Automated verification was partially skipped, correctly:** the browser console-error check and guard negative-test evidence were both skipped as not applicable (no UI handoff, no check-guard rules changed).

## Learnings

- **Notarization failure handling is a two-phase problem.** Rejections and wait timeouts can still return a submission ID (so `notarytool log` is fetchable), while invalid signatures can fail before any ID exists. Both paths need distinct, honest diagnostics — "no ID available" must be reported as such rather than guessed. This belongs in `docs/macos-hub-release.md`, which now carries the triage table; the task already updated it.
- **`tee` without `pipefail` masks a rejected submission.** Any pipeline that captures notarytool output for later parsing must run under `set -o pipefail` so the pipeline status comes from `notarytool`, not `tee`. A general note for CI-shell work in this repo could live in `docs/agent-workflow-rules.md` if similar capture pipelines appear elsewhere.
- **Stapling must be gated on the `Accepted` status, not on a zero exit code.** A successful submit exit alone is not the acceptance check; making staple/validate/assess unreachable unless status is exactly `Accepted` is the fail-closed shape worth copying into any future Apple-submission step.
- **A dry run is a test of the gate, not an override.** It must still require real credentials and never create or modify a release; conversely, secret checks do not belong in GitHub Actions `if:` expressions (secret values are not reliably available there) — validate in the shell and fail the job loudly instead.
- **Quoted `workflow_dispatch` inputs are strings even when declared boolean.** String-compare against `'true'` or a boolean comparison can fail open. Worth a line in `docs/agent-ui-and-preview-conventions.md` or the workflow conventions doc if this repo standardizes on `workflow_dispatch` switches.
- **Keep one authoritative secret contract.** The workflow quotes the runbook's existing secret names and precedence rather than inventing a second variant; when a runbook already names the variables, workflow and docs should share the same source of truth.
- **Process observation:** a clean exit code 0 is not a handoff. The first engineer turn ended while waiting on its own scoped check and produced no review request; the runner detected it and a follow-up turn completed handoff. If this pattern recurs across tasks, the runner-side detection and recovery path deserves a note in `docs/agent-debugging-and-incidents.md`.

## Follow-ups

None recorded. No tasks were filed from issues met along the way. (The dependency chain #0576/#0577/#0578 pre-existed this task as prerequisites of the same story; they are dependencies, not follow-ups. Until #0578 and the #0576 secrets land, the new notarization gate will fail the release job by design and no DMG will be uploaded.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
