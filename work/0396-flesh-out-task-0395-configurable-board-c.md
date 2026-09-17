---
id: "0396"
title: "Flesh out task #0395, “Configurable board column labels,”…"
type: feature
status: draft
priority: p2
area: general
assigned_to: ""
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-17T14:20:31Z"
updated_at: "2026-09-17T14:20:31Z"
---
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

## Activity

- 2026-09-17T14:20:31Z · created · hello@repoos.org
