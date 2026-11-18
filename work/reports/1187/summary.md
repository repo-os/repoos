## TL;DR

Task #1187 added a durable rule that agents must verify UI headlessly only: never run `open`/`xdg-open` on URLs, never launch a headed browser or the user's Chrome profile — always headless Playwright with its bundled browser. The rule landed in `AGENTS.md`, `docs/agent-ui-and-preview-conventions.md`, and the built-in engineer prompt (`src/core/config.ts` `DEFAULT_AGENTS`), pinned by a new test in `src/ui-app/tests/default-agent-prompts.test.ts`. As a concrete focus-stealing fix, `repoos init`'s automatic system-browser launch was removed; init now prints the console URL. Review passed on the first pass ("good to go") and the task closed out successfully.

## Outcome

The original report was that QA engineers' preview servers opened in Nick's real Chrome and stole focus. Nothing in `serve` or the `justfile` opens a browser, so the culprit was an agent using an OS-level opener. This task made the headless-only policy permanent and removed a repo-owned launch path:

- One-line rule added to `AGENTS.md` (file kept under the 30 KB limit; 27,510 bytes after the edit), with the long form in `docs/agent-ui-and-preview-conventions.md`.
- The same prohibition added to the built-in engineer instructions in `src/core/config.ts`, with a test asserting both the prohibition and the required headless-Playwright alternative, so a future prompt change cannot silently drop it.
- `src/commands/init.ts`'s `openBrowser` helper (which ran `open` / `cmd /c start` / `xdg-open` on the init console URL from `onReady`) removed; init now prints the URL instead. `init.ts` went from −25/+3 lines.
- `repoos.toml` was left untouched as instructed.

One acceptance criterion was only partially met: the worktree contained no transcript artifacts (`.repoos` had only `canary.txt`), so the exact command or browser channel behind the original incident could not be identified. The remaining `xdg-open` in `src/server/routes/support.ts` opens a selected directory in a support workflow, not a URL, and was judged out of scope.

Final verdict: review pass 1 returned **good to go**; the task merged (commit `b52a96bf158ee4dd96234416e680e675a6f85fc9`) and closed as `done` with `release:success`.

## Process stats

- **Dev rounds:** 2, both by the same engineer (agent `codex`, model `gpt-6-luna`). Round 2 was a continuation/re-verification after the first handoff attempt failed; the sessions table records a single engineer session (started 2026-11-18T14:47:45Z, elapsed 895s, 15,447,172 tokens; cost not recorded).
- **Review rounds:** 1 pass, verdict "good to go" (reviewer agent `reviewer`, model `gpt-6-luna`, 30s, 175,402 tokens; cost not recorded).
- **Routing sessions:** 2 (one before engineer start, one before review), model router (openrouter), model unknown, 0s/1s elapsed, tokens not recorded.
- **Restarts or model swaps:** none recorded.
- **Wall-clock, created → done:** 2026-11-18T14:08:00Z → 2026-11-18T16:27:59Z, i.e. 2h 19m 59s.
- **Checks:** first check attempt's first test pass reported 561 files / 8,030 tests passing, 1 skipped, but the session ended before the wrapper's second pass returned a final status. The re-run passed: remote validation in 792s, local changed-path checks exited 0 with "All checks passed". Close-out gate completed in 252s.
- **Shots:** skipped — the diff (8 changed paths) touched no capture target's globs.
- **Token/cost totals:** 15,447,172 (engineer) + 175,402 (reviewer) tokens; costs not recorded anywhere in the facts.

## What went wrong

- **Stalled engineer turns / CTO nudges:** the engineer went quiet twice; CTO nudges were queued at 15:01:14 and 15:04:28 after 5m without worktree activity. At 15:04 the first queued message sat undelivered for 3m with no output, so the turn was ended to force delivery; that turn exited cleanly but without a handoff. Resolved by ending the turn, delivering the message, and letting the engineer continue. Later nudges at 15:06:14, 15:17:02 and 15:57:02 were held because the handoff gate was already running.
- **Failed handoff (15:42:03):** finalization failed after the first check attempt — the remote validation runner's local command session disappeared mid-run, after the wrapper had started a second test pass, so the engineer could not observe the final check summary or exit code (round 1 flagged this for server-side confirmation). Handoff recovery was attempted and a message delivered at 15:42:06. Resolved by re-running `REPOOS_CHECK_CHANGED=main repoos check`: remote validation passed in 792s and the local changed-path check exited 0, after which the handoff succeeded (active→review at 16:10:00). No failing test output was ever observed; this was treated as a lost session, not a code failure.
- **Missing transcript evidence:** the task asked to find where a browser was actually launched by checking recent engineer transcripts, but no transcript artifacts were present in the worktree, so the original incident's exact command or channel was never confirmed. Resolved pragmatically: a repo-owned focus-stealing path (`repoos init`'s auto-launch) was found by source search and removed regardless. The incident's true trigger therefore remains unattributed in the record.

## Learnings

- **A repo can own a desktop-launch path even when its serve script opens nothing** — `repoos init` held a deferred `onReady` URL opener. Any future "agents must never open X" audit should search the whole source tree, not just serve scripts. The durable rule now lives in `AGENTS.md` (one line, link to the long form) and `docs/agent-ui-and-preview-conventions.md`.
- **The default agent prompt and repo-wide guidance are separate entry points and need the same language in both**, and a test should pin the prompt contract (`default-agent-prompts.test.ts`) so the rule can't silently disappear. This pattern — rule text + prompt + pinning test — is worth reusing for any future agent-behavior rule.
- **Searches for "browser openers" must distinguish URL openers from unrelated platform actions** (`window.open` in UI code, the support route's directory `xdg-open`, headless Playwright harnesses) to avoid false positives and over-broad bans.
- **A lost validation-runner session mid-check is indistinguishable from a hung check**; the recovery pattern was a clean re-run of the scoped check rather than debugging the wrapper. The existing guidance about distrusting check failures that flip with runtime speed (`docs/agent-debugging-and-incidents.md`) covers this class; no doc change was needed.

## Follow-ups

None. (Linked tasks: none recorded.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
