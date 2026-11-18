## TL;DR

Task #1175 fixed the recurring HTTP 401 on `/api/project-environments` that automated UI verification kept flagging in the no-auth handoff preview (the issue that had blocked #1157). The endpoint and its auth guard were correct; the real defect was the shot plan capturing the live `/secrets` route without the page's registered `secrets:populated` fixture. The fix declares the Secrets handoff shot with that fixture, adds a regression test for the fixture-state wiring, updates the November QA doc, and passed review and close-out on the first pass.

## Outcome

The Secrets page is designed to call `/api/project-environments`, and the server correctly returns 401 to unauthenticated callers. The handoff preview, however, captures the plain `/secrets` route with no authenticated session, so every automated verification recorded a 401 console error — blocking #1157 for several review passes until it landed via "Land anyway".

The shipped fix does not touch the endpoint or weaken authorization. Instead it aligns the capture with the page's existing fixture support:

- The `/secrets` handoff shot is now declared with `state: "secrets:populated"`, a registered fixture that renders a fake `dev-nick` environment and a local key inventory on mount and skips the protected `loadEnvironments` fetch entirely.
- A regression assertion was added to `src/ui-app/tests/shot-fixtures.test.ts` verifying that the capture URL builder encodes the shot state and that the UI-side fixture reader recognizes the resulting query parameter as `secrets:populated` — guarding the link between the declared shot plan and the fixture dispatch that bypasses the live fetch.
- `docs/qa/2026-11-web-qa-pass.md` was updated to record that handoff verification now uses local fixture data, while explicitly preserving the boundary that no signed-in Secrets behavior was observed in the original QA pass.

Diff: 2 files changed (`docs/qa/2026-11-web-qa-pass.md` +3/−1, `src/ui-app/tests/shot-fixtures.test.ts` +4/−0).

Final verdict: **good to go** (review pass 1), closed out successfully — status `done`, `release:success`, merged as commit `4114762540a50a22d09fe70331389324be7a6e31` from branch `feat/fix-401-on-api-project-environments-in-t`. Automated verification recorded 1 of 1 shot captured with a clean console (no blocking browser console errors).

The authenticated Secrets flow itself remains unverified and is deliberately not covered by this task.

## Process stats

- **Dev rounds:** 1 (engineering round 1).
- **Review passes:** 1, verdict "good to go".
- **Restarts or swaps:** none recorded.
- **Wall-clock, created → done:** 2026-11-18T04:17:45Z → 2026-11-18T05:49:09Z (1 h 31 m 24 s).
- **Status timeline:** inbox→ready 04:54:21Z, ready→active 04:54:29Z, active→review 05:10:26Z, done 05:49:09Z.
- **Agents and models:**
  - Engineer: `codex` / `gpt-6-luna` — recorded elapsed 723 s, 2,120,184 tokens, cost not recorded.
  - Reviewer: `codex` / `gpt-6-luna` — recorded elapsed 30 s, 213,239 tokens, cost not recorded.
  - Model router (openrouter): two routing sessions (1 s and 0 s), tokens and costs not recorded.
- **Close-out gate:** completed in 561 s.
- **Total tokens (where known):** 2,333,423 (engineer + reviewer); router sessions not recorded. **Total cost:** not recorded (all cost cells blank).

## What went wrong

- **First `repoos check` run failed at the formatter step** on the new test file. Resolved by running `bun run fmt` and re-running the check, which then passed formatting, lint, build, CSS/theme guards, rendered contrast, bare-require and artifact checks, remote validation, the UI smoke test, and the remote changed-path test run (105 tests passed).
- **Pressure-guard hold:** a CTO nudge at 05:07:12Z recorded "held — handoff gate is running"; RepoOS's pressure guard temporarily held local work. Resolved by waiting — the run proceeded and handoff completed at 05:10:26Z. No restart was needed.
- **Engineer session did not capture the browser shot itself.** This was by design (RepoOS owns managed preview capture at handoff), but it meant the shot's clean-console verdict only became evidence at handoff time (recorded 05:10:13Z as passed). Not a failure, but a sequencing expectation worth noting.
- No crashes, failed handoffs, or flaky checks were recorded.

## Learnings

- **An expected 401 from a protected endpoint can still be a real verification defect** when an automated shot captures the live page route without the page's registered preview fixture. The right fix is to seed representative UI data locally for no-auth captures and leave server authorization intact — never to open the endpoint or add verification exceptions. This distinction (shot-plan mismatch vs. authorization bug) is worth a line in `docs/agent-ui-and-preview-conventions.md`, since #1157 lost several review passes to it before this diagnosis.
- **A route alone is not a shot plan:** the fixture `state` must be declared together with the route, and ideally asserted end-to-end (URL builder → UI fixture reader) before capture, as the new test now does.
- **Automated screenshot fixes don't establish authenticated product behavior.** QA records should state that boundary explicitly and keep the environment-dependent follow-up open — this task's QA note update does exactly that.
- The fix pattern (existing page fixture + declared `state`) is reusable for any future no-auth preview capture that trips a protected API call; the fixture inventory to check first lives alongside the components (e.g. `shot-preview-fixtures.ts`).

## Follow-ups

None recorded in Linked tasks. (The updated QA note references pre-existing tracked follow-ups — #1163 incomplete Checks-tab interaction pass, #1164 authenticated Secrets behavior, #1165 Agents authentication guidance — but none were filed by this task; they were open before it started.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
