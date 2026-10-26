---
id: "0953"
title: "Secrets page: one compact line per secret with actions behind an options menu (Railway-style)"
type: feature
status: active
priority: p2
area: web
depends_on: ["0950"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/secrets-page-one-compact-line-per-secret
created_at: "2026-10-24T23:23:08Z"
updated_at: "2026-10-26T23:05:27Z"
---
## Problem

On the Secrets page each secret takes up too much vertical space, so a project with a couple of dozen variables needs a lot of scrolling and the page is hard to scan. Nick shared Railway's Service Variables page as the model to learn from (attached): every variable is exactly ONE compact line (a small icon, the name in monospace, a masked value, and for the hovered row a reveal-eye and copy button), with all the per-variable actions hidden behind a three-dot options button at the right. Its menu holds Edit, Seal, Promote, Generator and Delete, and the list header has the count, a search icon and the add/raw-edit actions.

## Desired UX

1. Every secret is a single line: key name, masked value (`•••••••` or equivalent), optional small badges (environment visibility, public-prefix warning, bound/granted state) kept short, and an options button (three dots) at the far right. Row height is compact and uniform, with no stacked sub-lines per secret.
2. Per-secret settings and actions (edit value, visibility/granting, bindings, copy, delete, whatever exists today) move into the options menu or an inline expander opened from that button. Nothing important is lost, and destructive actions stay confirmed with the shared dialog component.
3. Values are write-only exactly as today. A reveal-eye or copy button must NOT be added if the API cannot return values (see docs and AGENTS.md "Keep project secrets separate"); do not weaken that boundary to copy Railway's reveal icon. Only show controls the current API supports.
4. The list header shows a count and a filter/search for keys, plus the existing add actions, in the Railway style.
5. Consistent with the rest of the app: shared dropdown/menu components, theme tokens, keyboard-accessible menu, works on touch and narrow widths, no native title tooltips.

## Acceptance criteria

- [ ] Each secret renders as one line at the normal page width and still reads cleanly (long keys truncate with a styled popover, not wrap into a second line) at narrow widths.
- [ ] All actions that exist today are reachable from the per-row options button; none are removed.
- [ ] No plaintext value is ever rendered, requested or copyable; tests cover that the row and its menu never touch a value.
- [ ] A list of 20+ secrets fits in far less vertical space than before; record the before/after row height in the task note.
- [ ] Search/filter by key works and keeps the count in sync.
- [ ] Tests for the row, the menu actions, delete confirmation, filter, and keyboard access; contrast audit and hard-coded-color guard pass in all themes; user-docs/environment-and-secrets.md screenshots or wording updated if they describe the old layout.
- [ ] Declare `## Shots` for the Secrets page with several secrets and with the menu open, and look at them yourself.

## Notes for AI

- This edits `src/ui-app/src/views/SecretsView.vue`, which #0950 (page-load skeletons) also changes. This task depends on #0950 landing first, so start from main after that and keep the skeleton and cache behavior intact.
- Do not change the secrets API or storage; this is presentation only.

## Open the env file in the editor
Values are plaintext dotenv text in gitignored local files (user-docs/environment-and-secrets.md, 'What file-backed means'; ADR 0010). So instead of a reveal or copy button, add an Open in editor link next to the selected environment's file name (for example .env.dev-local), shown only when that environment's file exists. It reuses the existing open-in-editor mechanism (server route in src/server/routes/copy-inspector.ts and the dev.inspector.editorCommand setting). Security rules, with tests: the server opens only files registered as project environment sources (resolved from config and the environment id, never a path supplied by the client); the browser never receives a value; the link is hidden or disabled when the page is reached through a tunnel or any non-local request, and when no editor command is configured it explains how to set it (Settings control already exists for that key). Update user-docs/environment-and-secrets.md to say that values stay write-only in the UI and API, and that the file can be edited directly in an editor.

## Screenshots

![32](/api/tasks/0953/attachments/att_4d7f0e1b-8556-463c-a54e-c55d0dc87bd4.png)
![33](/api/tasks/0953/attachments/att_a916d88c-6229-483a-b449-897fc80fec55.png)

## Activity

- 2026-10-24T23:23:08Z · created · njachowski@gmail.com
- 2026-10-24T23:23:18Z · screenshots
- 2026-10-24T23:29:19Z · body: Open the env file in the editor (added)
- 2026-10-24T23:39:46Z · status inbox→ready
- 2026-10-26T21:40:48Z · status ready→active, branch
- 2026-10-26T23:01:29Z · body
- 2026-10-26T23:05:27Z · body
