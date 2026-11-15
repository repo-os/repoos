## TL;DR

Task #1123 fixed raw CLI error text leaking into the Agents page's Default agents last-runs list. `classifyAgentFailure` gained out-of-credit and quota/rate-limit classes (covering DeepInfra's "You need positive balance" and Antigravity's `RESOURCE_EXHAUSTED`/429 JSON), a generic fallback now turns anything unclassified into a one-line summary with the full text behind the "Raw CLI error" disclosure, and the last-runs list is filtered to configured agents from the last 14 days with a "Show older and other runs" toggle. Classification runs at read time, so old stored rows benefit without migration. One development round, one review pass (`good to go`), shipped and closed out on 2026-11-15.

## Outcome

Shipped, merged as commit `687e74b6`:

- **Failure classification** (`src/core/agent-failure.ts`): new out-of-credit class (balance / insufficient credit / payment required / HTTP 402) and broadened usage-limit regex (`Individual quota reached`, `RESOURCE_EXHAUSTED`, HTTP 429, with reset timing extracted from "Resets in …" or "until HH:MM"). Existing classes and the Copilot Auto tier case were kept; LIMIT stays one class with two summary templates so old copy stays stable.
- **Generic fallback**: anything unclassified gets a one-line summary — a short first line when it is single-line and free of JSON/stack/ANSI, otherwise "`<CLI> exited with an error.`" — with the fix line "Open Raw CLI error for details." and the ANSI-stripped raw text (capped at 8k characters) behind the disclosure. This covers every consumer of `formatAgentFailure`/`splitAgentFailureDetail` (Agents page, task cards, drawer, notifications, crash recovery).
- **Read-time formatting** in `GET /api/agents/last-runs`, so rows stored before this change are classified too; no migration of stored `errorReason` values.
- **List hygiene** (`src/core/agent-last-runs.ts`): primary rows are configured default agents / built-ins started within 14 days; model-router and decision-check rows are excluded from the default panel; a "Show older and other runs" toggle reveals the rest. Filtering is in core so it is unit-testable without mounting the view.
- Tests: table-driven classifier cases with the real production strings, fallback cases (JSON blob, multi-line, ANSI), filter unit tests, and endpoint-output coverage. Docs paragraph added to `user-docs/agents.md`.

Final verdict: review pass 1 returned **good to go** (with an evidence gap noted — see below), close-out succeeded, status `done`, release `success`.

## Process stats

- **Dev rounds:** 1 · **Review passes:** 1 · **Restarts or agent swaps:** none recorded.
- **Wall-clock, created → done:** 2026-11-14T18:02:14Z → 2026-11-15T04:02:45Z = 10 h 00 m 31 s.
- **Dev phase (active → review):** 18:44:56Z → 19:45:32Z = 1 h 00 m 36 s.
- **Review → done:** 19:45:32Z → 04:02:45Z = 8 h 17 m 13 s, dominated by the close-out gate (1172 s, i.e. ~19 m 32 s of that window; the remainder is the task sitting in review overnight).
- **Engineer:** agent `engineer`, model `composer-2.5` (cursor runner); session elapsed 3109 s, 2425 tokens, cost not recorded.
- **Reviewer:** agent `reviewer`, model `composer-2.5` (cursor runner); elapsed 60 s, tokens not recorded.
- **Routing:** one `Model router (openrouter)` one-shot, 1 s, model unknown, tokens not recorded.
- **Debugger sessions:** two `opencode-go/deepseek-v4.1-flash` runs on 2026-11-15 (01:15:48 and 01:45:43, 10 s each, finished) — recorded in the sessions table; their trigger and token/cost figures are not recorded.
- **Costs:** not recorded for any session.

## What went wrong

- **Nudge/delivery loop during development (18:53–19:37).** The CTO monitor sent 9 completion nudges, one every ~5 minutes, because worktree activity looked idle. Each nudged turn was then ended (exit code 143) to force delivery of the queued message — and the engineer produced no output in those turns, so the same pattern repeated 9 times ("Implementing core failure classification…", identical each time). At 19:16:48 the monitor correctly held a nudge because an undelivered message was already queued, but the loop resumed afterwards. The engineer never had a real stall — it handed off cleanly at 19:45 once the gate ran — but roughly the first 45 minutes of the dev phase were consumed by this cycle. Resolution: the engineer completed and handed off on its own; no manual intervention.
- **Overdue queued message.** At 21:07:42 a message queued at 19:45:32 (the handoff notification) was flagged as undelivered after 60 minutes. It was never delivered; no resolution is recorded.
- **Review evidence gap.** The handoff screenshot for `/agents?tab=default` matched the route with a clean console, but showed no last-runs rows at all — the preview server evidently had no matching session history, so the reviewer could not see the new filtering or failure copy in the shot. Verdict was `good to go` flagged `EVIDENCE-GAP-ONLY`, relying on unit tests and code inspection of the filter and formatter. The reviewer suggested re-capturing with fixture sessions; this was not done before close-out (not recorded as done).
- **Slow close-out gate.** The close-out gate took 1172 s; no failures recorded, just duration.
- **`repoos check` result on the branch itself:** not recorded in the facts (no check runs or failures appear in the log beyond the passing handoff verification).

## Learnings

- **Turn-ending to deliver queued messages can loop with the CTO nudge cadence.** A monitor ending a turn "so the message gets delivered" looks identical to an idle worktree from the monitor's point of view, producing a nudge→end→nudge cycle. The existing "held — an undelivered message is already queued" guard (19:16:48) is the right shape but fired only once. Worth extending the rule that a turn ended *to deliver a queued message* suppresses the next activity-based nudge: candidate for `docs/agent-workflow-rules.md`.
- **Read-time classification beats migration.** Because `formatAgentFailure` runs when last-runs are read, old raw `errorReason` rows were fixed without touching stored data — consistent with the #1098 design. If a new failure class is added later, follow the same pattern and extend the table in `src/core/agent-failure.ts` with the real production string.
- **Multi-line opaque output must never become a summary line**, even when its first line looks innocuous — the fallback rule ("CLI name + disclosure") is the durable guard. This belongs in the failure-formatting notes near `agent-failure.ts` rather than only in this report.
- **Shots need fixture data when UI depends on session history.** A route-level screenshot can't prove a list renders correctly when the preview environment has no sessions; declaring a `state` fixture is the fix. Worth a line in `docs/agent-ui-and-preview-conventions.md`.
- **Filter logic belongs in core**, not in the Vue view: it made the last-runs filtering unit-testable without mounting `AgentsView` — follow this pattern for future view-level filtering rules.

## Follow-ups

None recorded — no linked tasks were filed from this task. (The reviewer's suggestion to re-capture the shot with fixture sessions was noted but not filed as a task.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
