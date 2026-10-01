---
updated_at: "2026-10-01T14:34:35Z"
review_passes: 4
id: "0613"
title: Protect task bodies from clobbering and tighten shot capture
type: feature
status: review
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: The reviewer sent this back to the engineer 2 times and still found issues. Human review needed.
priority: p2
area: [core, server]
assigned_to: ai
created_by: ""
branch: feat/protect-task-bodies-from-clobbering-and-
created_at: "2026-10-01T09:30:31Z"
review_rounds: 2
dev_error_count: 1
---
## Problem

Task #0612 exposed a chain of related gaps. The PM agent fleshed the task out correctly, but the engineer's `repoos update 0612 --body "## Shots ..."` **replaced the whole body**, wiping Problem / Desired UX / Acceptance criteria / Notes (commit `5e6e9198` vs `41ad24fe`). The underspecified check (`src/core/task-underspecified.ts`) would have caught it, but it only runs after the PM run and on a draft→non-draft transition (`src/server/routes/tasks.ts`), never on a later body edit, start, or handoff. Separately, #0612's two declared shots both targeted `/agents` (the default tab) with no step opening the Detected tab, their `highlight` selectors (`.detect-row`, `.detect-deprecated-slot`) matched nothing so the capture went ahead un-highlighted with no warning, and the two entries were near-duplicates. Evidence for all of this is in `work/0612-*.md` history.

## Desired behavior

1. **Section-level body edits.** Add a way to set or replace a single `## Section` without touching the rest of the body (e.g. `repoos update <id> --section "Shots" --body-file/--section-body ...`, and the matching `PATCH /api/tasks/:id` shape). Engineers declare `## Shots` with it. A full `--body` replace that drops existing spec headings (Problem / Desired UX / Acceptance criteria / Notes for AI) should be refused (or require an explicit force flag) with a message pointing at the section form.
2. **Underspecified check on every body change and at start/handoff.** Re-run `flagUnderspecifiedIfNeeded` on every body PATCH (not only draft promotion). Also evaluate at Start and at handoff-to-review: warn visibly (activity note / needs-input) rather than silently proceeding. Decide per call site block vs warn; start should surface it, handoff should at least record a visible note. Keep the existing "don't clobber an unrelated needs_input reason" rule.
3. **Shot hygiene.**
   - When a declared `highlight` or `selector` matches zero elements at capture time, record a visible warning on the shot/task note ("highlight `.x` matched nothing on /route") rather than silently capturing.
   - Collapse declared shots with the same target + route + steps + selector (merging highlights into one shot, e.g. a comma-joined selector list) so near-duplicates become one capture.
4. **Shots are whole-window by default, with the change highlighted.** The preferred evidence is the whole visible viewport with the changed elements outlined via `highlight`, not a cropped element. Make that the documented default for declared shots: `selector` (element crop) is the exception, and `fullPage` stays off (visible window only). Confirm the actual current defaults in `src/server/shot-capture.ts` (`fullPage: false`) and `src/core/shot-page.ts`, and fix anything that crops by default.
5. **AGENTS.md guidance.** Engineers declaring `## Shots` for a tabbed view must reach the right tab: prefer a `?tab=<id>` route (e.g. `/agents?tab=detected`) over click steps, and always set `highlight` to the changed elements. Also document the section-edit command, and update the `AGENTS.md` template in `src/commands/init.ts` only if it carries the same shots guidance.

## Acceptance criteria

- [ ] A section-edit command/API replaces only the named `##` section; all other sections and the Activity log are preserved. Tests cover replace-existing, add-missing, and refuse-on-unknown-force cases.
- [ ] A full `--body` write that removes existing spec headings is refused unless forced; message names the section-edit alternative.
- [ ] Body PATCH re-runs the underspecified flag; clearing it when the body becomes well-specified again is handled. Start and handoff surface the flag visibly. Tests added alongside `task-underspecified-flag.test.ts`.
- [ ] A declared shot whose `highlight`/`selector` matches nothing records a visible warning; capture still succeeds.
- [ ] Declared shots with the same target/route/steps/selector collapse to one capture with merged highlights; tests in `shot-plan.test.ts`.
- [ ] Docs (`user-docs/` and `docs/` for shots, `AGENTS.md` shots paragraph) state: whole visible window + highlight is the default, `?tab=` routes for tabbed views, section-edit command.
- [ ] Settings/UI: no new user-facing `repoos.toml` key is introduced; if one is, add the Settings control per AGENTS.md.
- [ ] `repoos check --changed main` passes; `bun run fmt` run.

## Notes for AI

- Task-file writes must stay inside RepoOS commands/APIs (`src/commands/tasks.ts`, `src/server/routes/tasks.ts`, `src/server/write.ts`); do not hand-edit `work/*.md`. This touches the task body format handling, which is a self-modifying act — verify the parser still reads every file in `work/`.
- Existing helpers: `extractSection`, `removeSection`, `ACTIVITY_HEADING` etc. in `src/core/task.ts`.
- Shot code: `src/core/shot-plan.ts` (declared-entry resolution, around the `entries.push` near line 405), `src/core/shot-page.ts` (`applyHighlight` swallows no-match silently; `captureShotPage`), `src/server/shot-capture.ts` (handoff capture, "already captured" skip at ~line 87).
- #0612 as the worked example: its Detected tab is reachable by `/agents?tab=detected` (`AgentsView.vue` lines ~68–88).
- Declare this task's own `## Shots` using the new section command once it exists; if working before it lands, append rather than replace.
- Out of scope: changing which diffs trigger auto shots, or redesigning the underspecified heuristic itself.

## Original prompt

Follow-up to #0612: add a section-replace/append form for task bodies (so declaring ## Shots cannot wipe the body), re-run the underspecified check on every body PATCH and at start/handoff, warn when a declared shot highlight/selector matches nothing and collapse duplicate declared shots, make shots default to the whole visible window with the changed elements highlighted, and add AGENTS.md guidance to use ?tab= routes for tabbed views.

## Activity

- 2026-10-01T09:30:31Z · created · unknown
- 2026-10-01T09:35:09Z · status inbox→ready
- 2026-10-01T09:35:11Z · status ready→active, branch
- 2026-10-01T10:02:51Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-01T10:10:52Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-01T10:37:09Z · needs_input (dev-error) dismissed by hello@repoos.org
- 2026-10-01T11:02:38Z · cli_override, model_override
- 2026-10-01T11:02:39Z · model_override
- 2026-10-01T11:09:22Z · needs_input
- 2026-10-01T11:09:38Z · needs_input (underspecified) dismissed by hello@repoos.org
- 2026-10-01T11:41:49Z · status active→review
- 2026-10-01T11:41:50Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-01T11:42:24Z · status review→active
- 2026-10-01T12:13:51Z · status active→review
- 2026-10-01T12:13:51Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-01T12:34:16Z · cli_override, model_override
- 2026-10-01T12:34:29Z · status review→active
- 2026-10-01T12:34:29Z · needs_input
- 2026-10-01T14:19:33Z · needs_input (underspecified) dismissed by hello@repoos.org
- 2026-10-01T14:19:34Z · status active→review
- 2026-10-01T14:19:34Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-01T14:21:15Z · status review→active
- 2026-10-01T14:33:03Z · status active→review
- 2026-10-01T14:33:03Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-01T14:34:35Z · needs_input

