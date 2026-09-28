---
id: "0570"
title: Add an AI tl;dr callout to failed-task errors
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Desired UX, Notes for AI"
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: ""
pm_cli_override: opencode
pm_model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-28T06:07:26Z"
updated_at: "2026-09-28T06:43:03Z"
---
## Problem

When an agent run fails, the task shows a lot of raw text and logs. That's useful for debugging, but nothing tells the user, in one plain sentence, **what actually went wrong and what to do next**. The user has to read through protocol errors and stack traces to work it out.

The screenshot is the canonical example: the Review tab shows a wall of `github copilot` protocol text ending in `You have exceeded your monthly quota (Request ID: …)`, and the banner above the tabs says "The reviewer crashed or timed out without producing a report." Neither line says the actionable thing: **the reviewer ran out of credits — pick a different agent and retry.**

The Debugger agent already exists per task (`debugger:<id>`, #0337) and can diagnose exactly this, but it only runs when the user clicks "Fix" / opens the Debug tab, and nothing it produces is persisted or surfaced as a task-level summary.

## Proposal

Have the task's Debugger agent produce a one-line **tl;dr** — cause + next action — and show it as a callout the user can't miss at the top of the task, above the tabs.

Example: `Review agent ran out of credits — choose a different reviewer agent and try again.`

Two parts: (1) generate and persist the tl;dr, (2) render it prominently.

**Recommended trigger: automatic.** Kick the generation off from the failure itself so the user never has to know to ask. The alternative — generate on demand when the user opens the Debug tab — reintroduces the exact discoverability problem this task exists to fix, so treat it as a fallback only if cost forces it. Generation is best-effort either way (see below).

### 1. Generate + persist

- When a task enters a diagnosable failure state, run the configured Debugger agent once (a one-shot call, not the interactive chat session) with the failure context: `needs_input_reason`, the raw `needs_input_detail`, and a bounded excerpt of the relevant log / review transcript.
- Prompt for a strict single sentence: root cause + concrete next action. No preamble, no markdown, no restating the logs. Keep it short (target ≤ ~140 chars) so it fits one or two lines in the callout.
- Best-effort and asynchronous: it must never block the failure transition, never block the user, and never be waited on to render the existing banner/actions. A failed or timed-out run yields no tl;dr and leaves today's behavior intact.
- Skip when the Debugger is disabled or no agent is configured — the feature degrades quietly.
- Redact secrets before the failure context reaches the model (reuse `redactSecrets` in `src/server/routes/debugger.ts`).
- Persist on the task as new frontmatter, e.g. `debug_tldr` (string) and `debug_tldr_at` (ISO 8601). Add through `TASK_KEYS` / `parseTask` / `serializeTask` (`src/core/task.ts`), the core + UI `Task` types, and the live-index diffable field list so it streams over SSE without a reload.
- Clear `debug_tldr` / `debug_tldr_at` whenever the failure they describe is cleared — `needs_input` dismissed or cleared, status advances, or a fresh review starts for that episode — so a stale line can't outlive its failure.
- Dedupe: don't generate while one is in flight for the task, and don't regenerate when a tl;dr already exists for the same `(reason, detail)`.

Reasons that should trigger it (recommended minimum): `review-failed`, `dev-error`, `check-failed-after-retries`, `watchdog-stuck`. `cto-escalation` / `questions` and `underspecified` are not error diagnoses — no tl;dr for those.

### 2. Render the callout

- **Task drawer:** a distinct callout above the tabs, in the same region as the existing `waiting for you` block (`TaskDrawer.vue` ~3475–3561) but visually distinct — an icon plus a `TL;DR` / `what happened` label and the sentence. `role="status"`, high-contrast (amber/red-tinted) so it reads as the summary, not another log line.
- While generation is in flight, optionally show a subtle "diagnosing…" state in the callout; if it never arrives, show nothing extra.
- Do **not** remove or replace the existing raw detail/logs — the tl;dr is additive. The raw error stays in the Review/Dev/Debug tabs for anyone who wants it.

## Acceptance criteria

- [ ] For a task in a diagnosable failure state, the Debugger produces a single plain-language sentence naming the cause and the next action, persisted in task frontmatter.
- [ ] The sentence renders as a prominent callout in the task drawer above the tabs, visually distinct from the existing "waiting for you" banner and visible regardless of which tab is open.
- [ ] The reviewer-out-of-credits screenshot case yields a tl;dr equivalent to "Review agent ran out of credits — choose a different reviewer agent and try again" (exact wording need not match).
- [ ] Generation is non-blocking: the failure transition and the existing banner/actions appear immediately and are unaffected by a slow, failed, or absent Debugger run.
- [ ] Debugger disabled / no agent configured / run fails / times out → no tl;dr and no error surfaced to the user; existing behavior is unchanged.
- [ ] Secrets are redacted before the failure context is sent to the model.
- [ ] The tl;dr updates live via SSE and clears when the underlying needs-input flag clears (dismiss, status change, fresh review), with a test covering the clear path.
- [ ] The one-shot LLM call records usage via `recordOneShotSession(repoRoot, agent, result, { sessionType, taskId })` with a `sessionType` that keeps the Tokens by-role breakdown legible (e.g. `debugger`) — not silently discarded.
- [ ] No new runtime dependencies.
- [ ] `repoos check` passes.

## Out of scope

- Replacing or trimming the existing raw error/log surfaces (Review/Dev/Debug tabs) — the tl;dr is additive.
- The board card and mobile surfaces (drawer first; follow-ups can extend it).
- A copy button, a history of tl;drs, or a manual "regenerate" action.
- Letting the user edit the tl;dr.
- Changing the existing deterministic `needs-input-ui.ts` copy — it stays as the always-present fallback.

## Technical notes (non-binding)

- **Where `needs_input` is set:** `review.ts` (~905, `review-failed`), `agents.ts` (~6419/6425, `dev-error`), `integration-orchestrator.ts` (~2059, `check-failed`), `task-watchdog.ts` (`watchdog-stuck`). Prefer one shared "schedule a tl;dr for this failure" helper invoked from these paths over duplicating the call — the same consolidation #0385 did for retry hints.
- **Closest existing pattern for the run:** `src/server/skill-suggestions.ts` — a one-shot task-scoped agent run, gated on enabled + not-in-flight, recording usage, and storing its result on the task. Mirror its lifecycle rather than inventing a new one.
- **Debugger plumbing:** `config.builtInAgents?.debugger`, `debuggerAgent()`, `taskDebuggerSessionId()`; `buildTaskDebuggerContext()` in `src/server/routes/debugger.ts` is the existing secret-redacting context assembler and is the natural basis for the prompt. One-shot runner: `runPrompt` + `recordOneShotSession` in `src/server/agents.ts`.
- **Callout rendering:** `TaskDrawer.vue` critical-status block + `src/ui-app/src/lib/needs-input-ui.ts`; critical-status styles live in `src/ui-app/src/style.css` per the drawer/teleport conventions.
- **New field plumbing:** `src/core/task.ts` (`TASK_KEYS`, parse, serialize), `src/core/types.ts` + `src/ui-app/src/types.ts`, and the live-index diffable list (`src/server/live-index.ts`, near `needsInputDetail`).

## Related

- #0337 — per-task Debugger chat (`debugger:<taskId>`); this reuses that agent.
- #0241 — Debugger "Fix" action on close-out error cards.
- #0511 / #0405 — needs-input reason labels and `needs_input_detail`; the tl;dr is the AI-generated counterpart to that fixed copy.
- #0456 — critical status must be visible above the tabs, not buried in one tab.
- #0567 — click-to-copy in debug log entries (adjacent Debug-tab UX, not this task).

## Original prompt

When there's an error like this we currently show a lot of text and logs, which is useful, but could we also add a tl;dr one-liner from the debug agent in the task on: what was the issue and what to do about it. And include that tl;dr as a callout so the user can't miss it. 
E.g. for this one the tl;dr would be: Review agent ran out of credits, choose a different agent and try again.

## Screenshots

![Screenshot-2026-09-28-at-13.57.51](/api/tasks/0570/attachments/screenshot-1.png)

## Activity

- 2026-09-28T06:07:26Z · created · hello@repoos.org
- 2026-09-28T06:07:27Z · screenshots
- 2026-09-28T06:10:27Z · note: Freeform PM run failed: the opencode agent timed out after 180s
- 2026-09-28T06:10:27Z · needs_input
- 2026-09-28T06:12:21Z · needs_input
- 2026-09-28T06:12:49Z · pm_cli_override, pm_model_override
- 2026-09-28T06:13:21Z · pm_model_override
- 2026-09-28T06:15:48Z · title, body
- 2026-09-28T06:43:03Z · status draft→inbox
- 2026-09-28T06:43:03Z · needs_input
