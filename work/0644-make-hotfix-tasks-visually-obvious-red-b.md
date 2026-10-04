---
id: "0644"
title: "Make hotfix tasks visually obvious: red badge, red outline, drawer banner"
type: feature
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: ""
branch: ""
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-10-04T06:43:13Z"
updated_at: "2026-10-04T07:23:58Z"
---
## Problem
Hotfix tasks are easy to miss. On the board card the only indicator is a plain unstyled `hotfix` word (`.tc-hotfix` in `TaskCard.vue` has no CSS and uses a native `title` tooltip). The task drawer shows nothing at all, even though `task.hotfix` and `task.hotfixTarget` are available. A hotfix runs in the main checkout, skips preview and the review report, and blocks the checkout, so it should be unmistakable.

## Desired UX
- **Shared badge** used on both the card and the drawer: a red pill reading `HOTFIX`, with the target appended (`HOTFIX · BRANCH` or `HOTFIX · MAIN`). `main` is the riskier variant and should read louder.
- **Card:** a red-tinted outline on hotfix cards in every column (ready, active, review, done), built from existing red tokens, surviving the hover border change. Done cards keep a quieter version.
- **Drawer:** the badge in the header next to the priority chip, and a red-tinted banner under the title: running in the main checkout on `<branch>`, no preview, no review report. Disable or annotate the Preview row and Review tab for hotfix tasks.
- Styled keyboard-focusable tooltip instead of the native `title`.

## Acceptance criteria
- [ ] One shared badge component or class renders from `task.hotfix` on both card and drawer
- [ ] Target (branch/main) is shown, with main visually stronger
- [ ] Card has a red outline for hotfix in all columns, hover does not remove it
- [ ] Drawer shows the banner and the badge; Preview and Review are annotated or disabled for hotfix
- [ ] Only existing theme tokens (`--red`, `--red-tint`, `--red-border-tint`); the `hardcoded-colors` guard and the contrast audit pass in light and dark
- [ ] A test that the badge renders from `task.hotfix` and shows the right target
- [ ] No native `title` tooltip

## Notes for AI
Files: `src/ui-app/src/components/TaskCard.vue` (around the `tc-hotfix` span), `TaskDrawer.vue` (header chips and the Hotfix start button area), `style.css` (red tokens near the top). Overlay and tooltip rules in AGENTS.md apply. Declare `--shots` for a hotfix card (board) and a hotfix drawer. Red-on-red-tint text is the likely contrast failure in light mode, so check it with `bun run contrast:audit`.

## Scope
Covers: hotfix visibility on card and drawer. Deferred: changing hotfix behaviour itself.

## Activity

- 2026-10-04T06:43:13Z · created · unknown
- 2026-10-04T07:23:56Z · review_cli_override
- 2026-10-04T07:23:58Z · review_model_override
