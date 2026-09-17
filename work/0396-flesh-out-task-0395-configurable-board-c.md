---
id: "0396"
title: Configurable board column labels (display-only rename via repoos.toml)
type: feature
status: draft
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: ""
model_override: openrouter/xiaomi/mimo-v2.5
created_at: "2026-09-17T14:20:31Z"
updated_at: "2026-09-17T14:37:46Z"
---
## Summary

Let each repository rename the six board column labels via `repoos.toml`, e.g.:

```toml
[board.columns]
draft  = "Ideas"
inbox  = "Backlog"
ready  = "Selected for development"
active = "In progress"
review = "Code review"
done   = "Shipped"
```

**Hard constraint:** the six canonical status IDs (`draft`, `inbox`, `ready`, `active`, `review`, `done` — `src/core/types.ts:10`) are fixed forever. This is display-label customization only. It must NOT create custom workflow states, change column order, alter task frontmatter, change transition rules, migrate task files, or change API/CLI status values. Familiar labels are valuable; RepoOS must keep ONE stable underlying workflow for task files, automation, integrations, and upgrades.

## Verified facts (investigation, 2026-09-17)

- Canonical statuses: `STATUSES` in `src/core/types.ts:10`.
- Default labels: `COLUMNS` in `src/ui-app/src/stores/repo.ts:187` — Inbox / Ready / Active / Review / Done. The Draft column is rendered SEPARATELY in `src/ui-app/src/views/WorkView.vue` (`DRAFT_COL`, default label "Proposed / Drafts") — any implementation must cover it; it is not part of `COLUMNS`.
- Config architecture: the flat TOML parser (`parseFlatToml` in `src/core/config.ts`) already handles nested sections — `[board.columns]` arrives as `board.columns.draft` etc. Follow the existing per-field pattern in `loadConfig` + `getConfigSchema()` (`tier: "live" | "restart" | "guarded"`, `restartRequired`) — that is the existing mechanism for the live-vs-restart question. Settings reads config via `GET/PATCH /api/config` plus a raw TOML editor (`GET/PUT /api/config/raw`).
- Docs to update: `user-docs/configuration.md`. Init template: the repoos.toml string literal in `src/commands/init.ts`.

## Decisions

- Defaults: exactly today's labels when `[board.columns]` is absent.
- Partial overrides: merge over defaults — only overridden keys change.
- Validation: follow the repo's fail-soft convention (like `[[deployments]]`/preview-target rows): a label that is blank, non-string, >40 chars after trim, or a duplicate of another column's label falls back to the default for that column; valid siblings still apply. Never poison the whole config; log a warning server-side.
- Labels are display-only: never accepted as status values by CLI/API; status inputs and outputs stay canonical IDs everywhere (frontmatter, `PATCH /api/tasks/:id`, `repoos mv`, activity entries, URL filters).
- Apply behavior: pick live or restart via the existing config `tier`/`restartRequired` mechanism and surface it in Settings and docs — implementer's call, but it must be consistent with how other config fields behave and explicitly stated in UI/docs.

## UI surfaces to cover

Board column headers (including the separately rendered Draft column), task drawer status selector, board filters, Dashboard count cards ("drafts" etc.), empty states, and `repoos list` column headers (display-only; the CLI still takes canonical IDs as arguments).

## Acceptance criteria

1. `[board.columns]` absent → all labels byte-identical to today.
2. Partial override → unspecified columns keep defaults.
3. Blank / non-string / >40-char / duplicate labels → that column falls back to its default with a warning; valid siblings still apply.
4. All six columns renamed consistently across every UI surface listed above.
5. Task frontmatter, transition rules, API payloads, and CLI status arguments are unchanged (canonical IDs only).
6. `repoos init`'s generated repoos.toml gains a compact commented `[board.columns]` example noting it renames display labels only, with a pointer to the configuration docs.
7. `user-docs/configuration.md` documents the section: defaults, validation rules, live-vs-restart behavior, and three presets (plain RepoOS, Jira-style, lightweight Kanban).
8. Automated coverage: config parsing/defaults/validation unit tests, and UI tests asserting configured labels render on the board (including the Draft column) and that canonical IDs still drive transitions.

## Out of scope

Custom statuses, column reordering, per-user labels, label-driven CLI syntax, migrating existing task files.

## Original prompt

Flesh out task #0395, “Configurable board column labels,” into an implementation-ready RepoOS task. Do not implement it yet.

Context: RepoOS currently displays six board columns: draft, inbox, ready, active, review, and done. The product should let each repository change their visible labels in repoos.toml, so teams can use familiar language such as “Backlog,” “Selected for development,” “In progress,” “Code review,” or “Shipped.”

The six canonical status IDs must remain fixed. This is display-label customization only: it must not create custom workflow states, change column order, alter task frontmatter, change transition rules, migrate task files, or change API/CLI status values.

Please investigate the existing configuration parser/schema, Settings UI, API config handling, status constants, and every UI surface that displays a status. Then write a precise implementation plan with acceptance criteria and tests.

The intended configuration should be conceptually similar to:

[board.columns]
draft  = "Ideas"
inbox  = "Backlog"
ready  = "Selected for development"
active = "In progress"
review = "Code review"
done   = "Shipped"

Requirements to capture:

Default labels remain exactly as they are today when the section is absent.

Partial overrides should have a clear, safe behavior; decide whether unspecified labels use defaults.

Validate labels: reject or clearly handle blank, non-string, duplicate, and unreasonably long values.

Ensure all six columns are covered, including the separately rendered Draft column.

Use configured labels consistently throughout the UI: board headers, task drawer/status selector, filters, dashboard/count cards, empty states, and other user-facing status text.

Keep CLI and API inputs/outputs based on canonical IDs (draft, inbox, etc.); never make display labels command syntax.

Decide whether changes apply live or require a reload/restart, consistent with the existing config architecture, and make the behavior explicit in UI/docs.

Add a compact commented example to the repoos init generated repoos.toml, with a link/reference to the full configuration documentation. Make clear it only renames display labels.

Update configuration docs with defaults, the config reference, and a few sensible presets (plain RepoOS, Jira-style, and lightweight Kanban).

Add automated coverage for config parsing/defaults/validation and the relevant UI behavior.

The task should call out the main product constraint: familiar labels are valuable, but RepoOS must preserve one stable underlying workflow for task files, automation, integrations, and upgrades.

## Screenshots

![Screenshot-2026-09-17-at-21.38.11](/api/tasks/0396/attachments/screenshot-1.png)

## Activity

- 2026-09-17T14:20:31Z · created · hello@repoos.org
- 2026-09-17T14:20:31Z · screenshots
- 2026-09-17T14:34:04Z · title
- 2026-09-17T14:34:26Z · body
- 2026-09-17T14:37:46Z · model_override
