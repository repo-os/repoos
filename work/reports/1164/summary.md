## TL;DR

Task #1164 asked whether the Secrets page 401 observed during auth-less QA of task #1157 was a product bug. It was not: the endpoint correctly requires sign-in. But the page handled that boundary badly — the unsigned state showed a create-environment call to action that could not succeed, surfaced raw server text ("Authentication required"), kept stale cached environment/key metadata after a 401, and left dialogs, typed drafts and success banners mounted behind the error. Four engineering rounds (codex, gpt-6-luna) built a single sign-in-required state that clears cached data and all in-progress editing state, added regression tests for every 401 path, and added an authenticated server route-handler test. Review converged to "good to go" on pass 4; the task closed out with `release:success`. No live authenticated browser login was ever performed — verification rests on route-handler tests with a session fixture plus component tests, and the reports say so explicitly.

## Outcome

- The original 401 was correct server behavior at the authentication boundary; the defect was client-side error handling.
- `SecretsView.vue` now shows fixed copy — "Sign in to view project environments and keys." — selected from the structured `ApiError.status`, never reflecting server-provided error bodies. A 401 clears the environment list, snapshot and page-data caches, hides the key ledger and the empty-project creation CTA, and closes the remove-key confirmation, add/edit forms, open menus, typed drafts and stale status messages. The create-environment and open-in-editor mutation paths route 401 through the same shared handler; create-dialog entry points clear `createError`, so a page that recovers after Reload reopens the dialog clean.
- The server's access model was unchanged. A new route-handler test creates a valid admin session, invokes the real project-environments listing and key-metadata handlers, and asserts metadata is returned while the dotenv source value is not.
- UI regression tests cover cold 401, warm-cache 401, remove-key confirmation cleanup, save/create/edit draft cleanup, and create-dialog recovery after reauthentication, using fake secret values and asserting they never render.
- Two deterministic shot fixtures were declared and captured (unauthorized sign-in state, populated masked-key ledger); handoff captured 2 of 2 with zero console errors.
- Final review verdict: **good to go** (pass 4). Status closed as done with `release:success`; merged commit `6c5547ea4ef833c1407a61209664083d3f5a0f01`.

## Process stats

- **Rounds:** 4 engineering rounds, 4 review passes (verdicts: "needs some work" ×3, "good to go" ×1).
- **Wall-clock:** created → done, 11h 45m 43s (2026-11-17T17:53:29Z → 2026-11-18T05:39:12Z). Active → done, 5h 21m 31s (2026-11-18T00:17:41Z → 05:39:12Z). Close-out gate: 846s.
- **Engineer:** one recorded session — agent `engineer`, codex, model gpt-6-luna — started 2026-11-18T00:17:43.817Z, elapsed 2492s, 2,887,159 tokens, cost not recorded. Rounds 3–4 have no session rows in the record, so their tokens and costs are not recorded.
- **Reviewer:** four sessions. Passes 1–3 on opencode-go/deepseek-v4.1-flash: 199s / 54,715 tokens / $0.01680528; 368s / 62,150 tokens / $0.020998686; 284s / 88,565 tokens / $0.030129342. Pass 4 on gpt-6-luna: 39s / 253,978 tokens / cost not recorded. Recorded reviewer totals: 459,408 tokens, $0.067933308, 890s.
- **Routing:** four routing sessions (Model router, openrouter), model recorded as unknown; tokens and cost not recorded.
- **Engineer continuity:** no model swaps recorded; one orphaned process adopted, one stop-by-request, one turn that ended without a handoff (details below).

## What went wrong

1. **Round 1 check failure:** the scoped check caught a TypeScript error — the new test constructed `ApiError` without its required body argument. Fixed with an empty body; rerun passed.
2. **Round 2 check failure:** the scoped check caught a formatting failure in the Vue template. `bun run fmt` was run as required and the full scoped check rerun passed.
3. **Round 3 stalled check:** the remote scoped check session stopped returning output before a final status. The engineer restarted the exact required check and followed the second run to completion.
4. **Three rounds of review findings, each fixed the following round:** pass 1 — unsigned 401 still showed the create-environment CTA and raw server text; pass 2 — a 401 left the remove-key confirm dialog alive with stale metadata and an enabled destructive action, plus surviving `saveKey` drafts and a stale success banner; pass 3 — a stale sign-in error could reappear in the create dialog after recovery, and the unauthorized state had no declared shot (the sole capture was stale). All were addressed by round 4, which passed clean.
5. **Message delivery stall:** a message queued at 01:24:19 went undelivered; it was flagged overdue at 02:30:10 after 60 minutes and was only delivered at 03:41:23 when the task moved back to active. Earlier, at 01:05:36, a message undelivered for 7 minutes with no engineer output forced the turn to end so it could be delivered.
6. **CTO nudges held** four times: while remote validation ran, twice while the handoff gate ran, and once because an undelivered message was already queued.
7. **Engineer lifecycle turbulence:** an orphaned engineer process (pid 20173) was adopted at 03:57:13; the engineer was stopped by request at 04:16:03 with an active→review→active flip within seconds; and at 04:38:49 a turn ended cleanly without requesting handoff (exit code 0; stderr showed a codex models-manager request timeout). Handoff was then requested via CLI at 04:38:51.
8. **Live browser QA never happened:** the computer-use browser host reported no browsers/unavailable throughout. The engineer declined to use the auth dev backdoor because the worktree's `.env` symlink resolves into the off-limits main checkout. The accepted limitation, stated in every round: authenticated behavior is evidenced by the session-fixture route test and the admin-role UI harness, not an end-to-end browser login.
9. **Close-out merge preflight** reported only the task's own work-file conflicts with main, which close-out resolves from main; nothing else blocked.

## Learnings

- **A 401 is a page state transition, not an error string.** Cached data, dialogs, drafts, typed secret values and success banners all live in independent reactive state and must be cleared together; mutation paths must route through the same handler or they re-leak raw server text. Worth carrying into `docs/agent-ui-and-preview-conventions.md` as a rule for auth-error handling in views that display secrets.
- **Authorization denial is not a connectivity failure.** Warm caches may legitimately survive ordinary refresh errors, but a 401 must drop cached metadata and disable actions the server will reject. Same doc destination.
- **Label evidence by what it proves.** A populated fixture proves rendering; a session-fixture route test proves handler-level authorization; neither is a live browser login. Reports that conflate these overstate coverage — a candidate line for `docs/agent-workflow-rules.md`.
- **Use the real server response text in regression tests.** Pass 1 flagged that the test asserted "Unauthorized" while the actual 401 body is "Authentication required", making the no-leak assertions vacuous. Later rounds used the real text.
- **Keep one engineering report per round tied to the reviewed HEAD.** Pass 3 flagged that round-3 code had no current report (the posted one was for an older tree).

## Follow-ups

None filed (Linked tasks: none recorded). Reviewers noted a pre-existing, out-of-scope issue — `DeploymentsView` still surfaces raw "Authentication required" on a 401 — but no task was recorded for it.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
