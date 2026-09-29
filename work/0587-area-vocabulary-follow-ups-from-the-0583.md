---
id: "0587"
title: "Area vocabulary follow-ups from the #0583 review"
type: chore
status: review
priority: p3
area: web
assigned_to: ai
created_by: ""
branch: feat/area-vocabulary-follow-ups-from-the-0583
review_model_override: opencode-go/mimo-v2.6-flash
created_at: "2026-09-29T19:27:29Z"
updated_at: "2026-09-29T21:18:49Z"
---
## Context

Follow-ups from the #0583 (area vocabulary) review, deliberately left out of that change so it could land. The two blocking defects from round 3 (clearing `[[areas]]` rows, and this repo declaring no vocabulary) were fixed in #0583 itself.

## Items

1. **New-task default area.** `ui.nt.area` defaults to `"web"` (`src/ui-app/src/stores/ui.ts`, `TaskDrawer.vue`), which is outside the vocabulary of any repo that does not declare `web` (e.g. a repo with only `landing`/`docs`), so New task pre-selects an unregistered area and offers "add web". Default to the first declared area (or empty) instead.
2. **`repoos init` on an existing repo** scaffolds only the commented `[[areas]]` stub; the "define areas and previews together" prompt runs only in the guided new-repo flow. Offer it for existing repos too (skippable).
3. **Migration commit failure.** The one-time `a + b` → list migration ignores `commitFiles` returning `false`, so a failed commit leaves `main` dirty. Surface it (log + retry on next boot) instead of silently continuing.
4. **Drift warning only on API/UI patches.** The "areas no longer resolve" advisory fires only when config is changed through the API/UI, not on a direct `repoos.toml` edit. Run it on config reload too.
5. **Long-tail areas on the board.** This repo's board still has one-off values (`ui-app`, `api`, `ai`, `agents`, `user-docs`, `support`, `release`, `pm`, `init`, `docs-debt`, `tech-debt`). Decide which to fold into the declared vocabulary and rewrite the rest, as a one-time cleanup through `repoos update --area`.
6. **Integration with #0582.** When #0582 lands, its area-mismatch warning and `paths` matching must consume `parseTaskAreas` (`src/core/areas.ts`) rather than add a second splitter.

## Acceptance criteria

- [ ] Each item above is either fixed with a test or explicitly dropped with a note in this task.
- [ ] No new runtime dependency; docs updated where behavior changes.

## Activity

- 2026-09-29T19:27:29Z · created · unknown
- 2026-09-29T20:42:11Z · review_model_override
- 2026-09-29T20:42:11Z · status inbox→ready
- 2026-09-29T20:42:12Z · status ready→active, branch
- 2026-09-29T20:57:13Z · note: Item 5 (long-tail board areas) dropped from this branch, by design: the handoff guard (src/server/review-guard.ts) strips every work/*.md file except this task's own, so a branch physically cannot carry a cross-board area rewrite, and rewriting 19 sibling task files would also race concurrently active tasks. It is a board-data cleanup for a direct-to-main pass via `repoos update --area`. Mapping to apply then: ui-app→web, api→server, ai/agents→agent, user-docs→docs, init→cli; declare or fold tech-debt/docs-debt/support/release/pm (suggest general for the debt/support ones, infra for release); multi-value rows [server, ui-app]→[server, web], [landing, user-docs]→[landing, docs], [core, server, ui-app]→[core, server, web]. Items 1-4 and 6 are implemented with tests.
- 2026-09-29T21:18:49Z · status active→review
