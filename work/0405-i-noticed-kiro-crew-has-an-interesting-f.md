---
id: "0405"
title: Auto-suggest reusable skills from completed task sessions
type: feature
status: review
priority: p2
area: core
assigned_to: ai
created_by: hello@repoos.org
branch: feat/auto-suggest-reusable-skills-from-comple
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
review_cli_override: github copilot
review_model_override: default
created_at: "2026-09-18T06:54:58Z"
updated_at: "2026-09-18T09:59:18Z"
handoff_signal_retry_count: 1
dev_error_count: 3
---
## Problem

When an agent completes a task that involved a non-trivial multi-step procedure, that knowledge is lost — it lives only in the task transcript and is never surfaced as a reusable skill. Other projects (e.g. Kiro Crew) solve this by analysing completed sessions and drafting skills automatically. RepoOS should adopt a similar pattern, but rather than silently creating a skill file, it should create a structured task ("New Skill Suggestion: …") so the human reviews and approves the suggestion before anything goes live.

## Desired UX

After a task moves to `review` (or `done`), the system analyses the session transcript and decides whether a non-trivial, reusable multi-step procedure was performed. If one is detected:

1. A new task is automatically created with the title `New Skill Suggestion: <short procedure name>` and type `spec`, pre-filled with a draft skill body in the standard `SKILL.md` format used by the skills system.
2. The suggestion task is flagged visibly in the review drawer of the originating task (a short note: "1 skill suggestion created → #<id>") so the reviewer sees it alongside the code review.
3. At most **one** suggestion task is created per originating task, regardless of how many candidate procedures were identified. Additional candidates may be listed as a mention inside the single suggestion task body or in the originating task's review report — they are never turned into separate tasks.
4. The feature is **on by default** and can be toggled in Settings (a new boolean option, e.g. "Auto-suggest skills from completed sessions"). The setting lives alongside other agent-behaviour settings; it surfaces in the Settings page, not buried in the Context / Skills tab.
5. Nothing goes live as an actual skill until a human explicitly works the suggestion task (reads the draft, edits as needed, and closes it out the normal way).

## Acceptance criteria

- [ ] When a task transitions to `review` (or `done` if review is skipped), the skill-suggestion pass runs against the task's session transcript.
- [ ] If a reusable multi-step procedure is detected, exactly one `New Skill Suggestion: <name>` task of type `spec` is created via the normal RepoOS task-creation path (`POST /api/tasks` or `repoos new`), with a draft skill body pre-populated.
- [ ] If multiple candidate procedures are identified, additional ones appear as a list inside the single suggestion task body; no extra tasks are created.
- [ ] The originating task's review drawer shows a one-line note linking to the suggestion task (e.g. "Skill suggestion: #<id>") when one was created.
- [ ] The skill-suggestion pass is **enabled by default**; a boolean setting in Settings ("Auto-suggest skills from completed sessions") can disable it.
- [ ] When the setting is off, no suggestion tasks are created and no review-drawer note appears.
- [ ] The suggestion task is created with `assigned_to: human` and `status: inbox` so it enters the normal human-review queue and is never auto-started by the engineering dispatch.
- [ ] The skill-suggestion analysis runs via the configured LLM (same agent infra already used for the reviewer); its token spend is recorded in the `sessions` table with `sessionType: "skill-suggestion"` and the originating `taskId`.
- [ ] `repoos check` passes (build, typecheck, tests, UI smoke) with the feature enabled and disabled.

## Notes for AI

- **Where to trigger:** the reviewer agent path in `src/server/review.ts` is the natural place to hook this — it already fires when a task enters `review`. Alternatively hook into the `done` pipeline in `src/server/server.ts` for the skip-review case. Prefer a single hook location; add a second only if the skip-review case is genuinely unreachable from the review path.
- **Skill draft format:** match the existing `SKILL.md` format expected by the skills system (see `GET /api/skills` and whatever source files back it). The suggestion task body should contain the full draft so a human can copy-paste it directly into a skill file if they approve it.
- **Settings plumbing:** the existing settings infrastructure is in `src/core/config.ts` (`repoos.toml` + in-memory config) and the `PATCH /api/config` endpoint. Add `skillSuggestions: boolean` (default `true`) there and wire it to the Settings page in `src/ui-app/src/views/SettingsView.vue` (or wherever the agent-behaviour toggles live — check `src/ui-app/src/views/` first).
- **LLM call recording:** use `recordOneShotSession(repoRoot, agent, result, { sessionType: "skill-suggestion", taskId })` from `src/server/agents.ts` immediately after the await — do not silently discard the result.
- **One task max, hard cap:** the code must enforce this even if the LLM returns multiple candidates. Create the first, mention the rest in the body, stop.
- **Do NOT** create skill files directly or modify `work/*.md` files by hand — all task creation goes through `repoos new` / `POST /api/tasks`. Do NOT surface this on the Context / Skills tab as a live skill; it is a suggestion task only.
- **Assumption:** "review stage" is the primary trigger (the explanation asked whether this should be review or dev stage — defaulting to review because the transcript is complete and the human is already looking at the task). If the task skips review (`active` → `done` directly), the pass should still run at `done` time.

## Scope

This task covers:
- The skill-suggestion analysis pass and task-creation logic.
- The review-drawer note linking to the suggestion task.
- The Settings toggle (`skillSuggestions` config key, UI control).
- Token-spend recording for the analysis call.

Deferred:
- Bulk back-fill of suggestions for already-completed tasks.
- Any UI on the Skills / Context tab for pending suggestions (the suggestion is a normal task in the board; no special Skills-tab UI is needed now).
- Automatic promotion of an approved suggestion into a live skill file (that is a separate workflow).

## Related

- `src/server/review.ts` — reviewer agent trigger, natural hook point
- `src/server/server.ts` — done pipeline for skip-review case
- `src/core/config.ts` — settings / config plumbing
- `GET /api/skills` — existing skills API; check the backing source for the expected SKILL.md format
- `src/ui-app/src/views/` — Settings page location

## Original prompt

I noticed Kiro crew has an interesting feature to auto-generate skills: "Auto-generate skills from sessions
Analyze each completed session and draft a reusable SKILL.md when a non-trivial multi-step procedure is detected. Off by default. Drafts are staged to the pending queue on the Skills tab for review — nothing goes live without your approval (see below)." Let's adopt that and put it somewhere (note that currently skills are shown in the context page, but this should probably surface as a setting (default on). Maybe instead of automatically creating a skill we create a task describing the skill (in the correct spec format with a standard title like: "New Skill Suggestion: xyz")and flagging it to the user in the review. Should this be part of the review or dev stage? and at most suggest 1 new skill per task (if other skills are identified they could also be mentioned in the review or new skill task, but not created as a multiple tasks to avoid spam)

## Activity

- 2026-09-18T06:54:58Z · created · hello@repoos.org
- 2026-09-18T06:55:33Z · status draft→inbox, title, area, body
- 2026-09-18T06:56:22Z · status inbox→ready
- 2026-09-18T06:58:12Z · status ready→active, branch
- 2026-09-18T07:03:23Z · agent exited with an error (kiro) · Error: Internal error
- 2026-09-18T07:10:02Z · needs_input
- 2026-09-18T07:13:25Z · agent exited with an error (kiro) · Error: Internal error
- 2026-09-18T07:21:45Z · cli_override
- 2026-09-18T07:21:51Z · model_override
- 2026-09-18T07:21:52Z · needs_input
- 2026-09-18T08:45:10Z · agent exited with an error (opencode) · [91m[1mError: [0mSession not found
- 2026-09-18T09:08:36Z · needs_input
- 2026-09-18T09:59:10Z · review_cli_override, review_model_override
- 2026-09-18T09:59:18Z · status active→review
