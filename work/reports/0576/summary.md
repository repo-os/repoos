## TL;DR

Task 0576 shipped a documentation-only change: a new signing/notarization credential contract and maintainer provisioning/rotation runbook section in `docs/macos-hub-release.md` (+270 lines). It names every CI secret the downstream macOS Hub signing tasks (#0577–#0579) consume, defines each value's exact format, and gives separate rotation procedures for the Developer ID certificate and both supported notarization credential sets. No workflow, Xcode, or credential material was changed. One engineering round, one review pass (verdict `good to go`), merged as commit `848ea9ba4e9ea6f04c53d5bd9ddf18a1ba2c1f65` with `release:success`.

## Outcome

`docs/macos-hub-release.md` gained a credential-contract and runbook section covering:

- The exact secret contract: `MACOS_CERTIFICATE` (one line of standard Base64 of a password-protected PKCS#12 export containing the Developer ID Application certificate *and its private key*), `MACOS_CERTIFICATE_PASSWORD` (plain-text export password), and `APPLE_TEAM_ID` (the 10-character team identifier from Membership details).
- Both notarization credential sets with exact names: the recommended `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` path, or the `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER_ID` trio. `APPLE_API_KEY` is defined as the full PEM contents of the `.p8` (materialized at runtime in `$RUNNER_TEMP`, never a provisioned path secret — no `APPLE_API_KEY_PATH` exists).
- Maintainer-facing provisioning steps (Keychain CSR, Developer ID Application certificate request, password-protected `.p12` export, base64 encoding, GitHub Actions secret entry) and secure cleanup of temporary files.
- Separate rotation procedures: certificate rotation via expiry overlap (revocation reserved for compromised keys, since revoking a Developer ID certificate can prevent already-signed apps from launching), and notarization-credential rotation with new-before-old revocation.
- A deterministic selection rule for which notarization set is active, with the choice recorded (never the values) in the provisioning PR/task.

The final verdict was `good to go` on review pass 1, and the task closed out successfully. Consistent with the task's deliberate scope, the runbook explicitly states that repository secrets are not asserted to exist and the DMG remains ad-hoc signed and not notarized until #0578/#0579 land; actual Apple Developer account and GitHub secret provisioning remain human-only follow-up operations outside this task.

## Process stats

- **Dev/review rounds:** 1 engineering round, 1 review pass (`good to go`). Restarts, agent swaps, or model swaps: none recorded.
- **Wall-clock, created → done:** 2026-09-28T18:42:44Z → 2026-11-15T20:39:31Z = 48 days 1 hour 56 minutes (dominated by the needs-input stretch, see below). The active engineering window was 2026-11-15T18:31:00Z → 2026-11-15T20:39:31Z ≈ 2 hours 8 minutes.
- **Engineer:** `opencode-go/deepseek-v4.1-flash` via opencode — 419 s, 102,152 tokens, cost $0.033631734.
- **Reviewer:** `composer-2.5` (cursor) — 30 s; tokens and cost not recorded.
- **PM:** `opencode-go/deepseek-v4.1-flash`, two sessions — 2026-10-05T15:52:05Z (122 s, 27,751 tokens, $0.009620052) and 2026-10-07T14:01:36Z (34 s; tokens and cost not recorded).
- **Routing:** two OpenRouter model-router sessions (1 s each, model unknown, no token/cost recorded) and one decision-check session on `typesafe/jev-1.14-20261014` (1,786 tokens, 0 s elapsed; cost not recorded).
- **Totals where recorded:** token counts across the three sessions that recorded them sum to 131,689; the remaining sessions did not record token counts, so the true total is higher. Recorded costs sum to $0.043251786; other sessions' costs are not recorded.
- **Close-out gate:** completed in 71 s; `release:success`.

## What went wrong

- **Six-plus weeks in needs-input.** Between 2026-10-05T11:15:31Z and 2026-10-22T07:47:35Z the task logged 12 `needs_input` events and three body revisions after creation (2026-10-05T15:51:45Z, 2026-10-07T14:01:20Z, 2026-10-07T18:05:22Z). The specific reasons for each transition are not recorded in the log. It sat idle until being moved `ready→active` on 2026-11-15T18:31:00Z, after which the work itself took under 10 minutes of engineer time.
- **Undelivered handoff message.** A message queued at 2026-11-15T18:40:14Z was flagged `message_overdue` twice (2026-11-15T19:49:09Z and 20:38:27Z, "still queued after 60m without being delivered"). How it was ultimately delivered is not recorded, but the task proceeded normally: the close-out gate completed at 20:39:27Z and status reached done at 20:39:31Z.
- **Stale commit reference in the engineer report.** The engineering round cited commit `80c640b` while the branch HEAD was `6debb0f` (bookkeeping-only follow-ups). The reviewer resolved this by evaluating the diff at HEAD rather than the cited commit.
- **Anticipated merge conflict on `work/0576-*.md`.** The review flagged the expected conflict with main; the standard server landing checklist handled it — the close-out gate completed cleanly in 71 s.
- No crashes, stalls, failed gates, or flaky checks are recorded. Shots were skipped because the docs-only diff touched no capture target's globs (a skip, not a failure).

## Learnings

- **Credential contracts must specify *representation*, not just names.** A base64 `.p12` blob, a plain-text password, PEM key contents, a file path, and a GitHub secret are easy to confuse and fail late in CI. This is now the durable record in `docs/macos-hub-release.md`; future CI-secret tasks should treat that section as the canonical contract rather than re-deriving names and formats.
- **Rotation and revocation are different operations for Developer ID certificates.** Apple's guidance says revoking a certificate can stop already-signed apps from installing or launching, so routine rotation should use expiry-based overlap and reserve revocation for compromised keys. Already embodied in the runbook — no additional AGENTS.md or ADR change needed.
- **Documenting two parallel credential paths without a selection rule creates ambiguity** that surfaces at provisioning time. The fix (deterministic presence rule plus a recorded choice) is a pattern worth reusing whenever a workflow accepts alternative credential sets.
- **Scoping agent acceptance to documentation when the real work is human-only worked as designed.** This follows the existing AGENTS.md rule against closing out human-gated work as if the human part were done; the task's criteria made the boundary explicit and the review held to it. No new rule required.

## Follow-ups

None. (Linked tasks: none recorded. The human-only Apple Developer account and GitHub secret provisioning remains external to this task by design, as stated in the task body and the runbook itself, but no new task was filed for it in this record.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
