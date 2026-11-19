## TL;DR

Task 1222 (round 2 of the Settings-tabs QA pass) is done and merged (commit `e8472b9`). The round was a verification pass: every Settings tab was walked headlessly at 375 / 768 / 1280 px (21/21 clean), 114 schema-backed controls were round-tripped through save → reload → verify, validated fields rejected invalid input with plain-English errors, and the raw-TOML, Notifications, Security, Import/Export and Support flows were exercised against throwaway fixtures. No product defects were found — the round-1 fixes held — so the shipped diff is the QA report plus seven reproducible walkers under `docs/qa/`, not code changes. The path was bumpy operationally: the primary fallback agent repeatedly ended turns (exit 130) to deliver queued CTO-nudge messages, one engineer crash needed recovery, and a watchdog restart was required before handoff.

## Outcome

- Every acceptance criterion met: all seven Settings tabs save, validate and fit small screens; the pass ran headless against fixtures only (Playwright WebKit, per-tab scratch repo with its own minimal `repoos.toml` on `port: 0`, auth disabled); the real `repoos.toml` was never read or written; malformed-TOML writes left the fixture file byte-identical on disk.
- Verification results: 21/21 tab × width layout combinations clean; 114 controls audited (90 General, 24 Advanced), 108 restored byte-identically after reload, the 6 non-identical rows traced to probe artifacts (float re-display rounding on 3 duration fields; string-probing of 3 array-typed controls correctly rejected server-side), not product bugs. Dedicated walkers proved array-field validation errors appear before any reload (e.g. "not-an-email is not an email address"), Notifications store-backed controls round-trip, Security session duration persists, and Import/Export / Support flows work.
- Shipped: `docs/qa/2026-11-settings-tabs-qa-2.md` (+135 lines) and seven re-runnable walkers `docs/qa/settings-tabs-qa2-*.mjs` (walk, audit, arrays, array-errors, event-toggles, panels, flows) — 10 changed paths total. No product code changed.
- Final verdict: review pass 1 returned `good to go`; task closed `done`, `release:success`, merged as `e8472b9d03513cec84b17c75057b4188c10b1704`.

## Process stats

- Created 2026-11-19T07:17:47Z → done 2026-11-19T09:33:57Z: **2 h 16 m 10 s** wall-clock start-to-done.
- Engineering rounds: **1**. Review passes: **1** (`good to go`, reviewer 56 s).
- Agents/models per role:
  - Engineer: `opencode` on `opencode-go/glm-5.3-flash`. Assigned before start: `codex` + `gpt-6-luna`, but that agent was paused out of usage since 07:09:32Z (provider quota), so the runner fell back to opencode + glm-5.3-flash — one agent swap before work began, no restarts or swaps afterwards.
  - Reviewer: `opencode` on `opencode-go/glm-5.3-flash` (34,691 tokens, $0.00890616, 56 s).
  - Debugger: one session on `opencode-go/deepseek-v4.1-flash`, 7 s, started at the 08:22:32Z agent-exit; no tokens recorded.
  - Routing (Model router, jev): two sessions, model not recorded.
- Tokens / cost (where recorded): engineer 151,498 tokens, $0.03335988 (session record shows 159 s elapsed, despite activity spanning the full window); reviewer 34,691 tokens, $0.00890616. Total where known: **186,189 tokens, $0.04226604**; debugger and routing sessions: not recorded.
- Shots: skipped by the server — the diff touches no capture target's globs (no UI change).
- Close-out gate: completed in 69 s.

## What went wrong

- **Quota-fallback at assignment.** `codex + gpt-6-luna` was paused out of provider usage at 07:09:32Z, so the task started on the opencode + glm-5.3-flash fallback. Resolved automatically by the runner.
- **Turn-ending churn from queued messages (exit 130 × 8).** The engineer's turns were repeatedly cut short (07:32:51, 07:36:07, 07:41:08, 07:55:29, 08:00:59, 08:05:59, 08:11:31, 08:20:31) to deliver queued CTO completion nudges (9 sent, 6 additionally held because a message was already queued). Each exit ended "without a handoff"; work resumed on delivery, but the worktree accumulated walker scripts and a report draft with placeholders across resumes.
- **Orphaned process + agent crash.** At 08:22:29 an orphaned engineer process (pid 91480) was stopped; the agent exited with an error and crash recovery resumed opencode + glm-5.3-flash (1/3 crashes in 30 m), briefly setting `needs_input`. A second orphaned run process (pid 75340, a `bun -e` import of a `docs/qa/settin…` script, 2 m old) was stopped at 08:35:38.
- **Watchdog restart before handoff.** At 09:08:42Z a message queued and sat undelivered with no live process; at 09:11:50 the watchdog restarted the engineer; the message was delivered and handoff followed at 09:15:08.
- **Audit methodology false negatives (fixed in-session).** The first control audit swept controls hidden by `v-show` panels; the first array probes checked for rejection messages after a reload, which resets the save message — producing a false "no validation" signal. Both were corrected: visible-and-editable-only enumeration, and a dedicated `array-errors.mjs` walker asserting errors pre-reload.
- **Report draft changed on disk mid-session** between the engineer's first read and first edit (placeholders already filled, no visible agent process). Treated as possible parallel human work: not overwritten, every claim verified against the JSON outputs of that session's runs, then three precision edits made.
- **Flaky-looking console noise.** Benign WebKit fetch noise (1,746 audit entries) appeared even in solo runs under rapid navigation; the engineer filtered every entry not matching the known noise pattern (zero genuine errors) and corrected the report's wording to state exactly that.

## Learnings

- **Capture validation errors before any reload** — a reload resets the save message, so reload-then-check probes falsely report "no validation". This was the root of every false negative in the round. Documented with the exact repro in `docs/qa/2026-11-settings-tabs-qa-2.md`; if it recurs, a one-line rule belongs in `docs/agent-ui-and-preview-conventions.md`.
- **Enumerate visible-and-editable controls only** — `v-show` panels keep fields in the DOM, inflating counts and false alarms. Same doc.
- **Explain probe artifacts, don't average them away** — float re-display rounding and string-probing array-typed inputs look like persistence failures until traced; the report names each and points at the dedicated probe.
- **Classify known browser noise before claiming "zero page errors"** — exclude the benign WebKit access-control pattern explicitly or one run undermines the report.
- **Treat a concurrently-edited worktree file as user work** — verify against evidence instead of overwriting or blindly trusting; that produced a better report here.
- **Operational pattern worth a durable rule:** queued CTO nudges repeatedly killed engineer turns mid-flight (8 exit-130 endings) and, with a dead process, needed a watchdog restart. The nudge-hold dedupe (6 held) helped but didn't prevent the turn endings; if this pattern repeats across tasks, `docs/agent-workflow-rules.md` should describe when nudges may end a turn vs. wait.
- **Reviewer suggestion (minor, not filed):** `settings-tabs-qa2-audit.mjs` writes its progress log to the relative `.repoos/qa-1222-progress.log`; prefer the env-gated `QA_PROGRESS` path `walk.mjs` uses so running it from the real repo root doesn't drop a file in the live checkout.

## Follow-ups

None.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
