---
id: "0779"
title: Add settings import and export
type: feature
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-settings-import-and-export
model_override: opencode/muse-spark-1.3-contributor-free
created_at: "2026-10-14T08:01:16Z"
updated_at: "2026-10-14T08:32:51Z"
---
## Problem

Using RepoOS across multiple projects makes it difficult to copy important settings between projects. There is no convenient way to export selected settings from one project or import exported settings into another.

## Desired UX

Add an **Import/Export** tab to Settings. Users can choose which settings to export, including Agent+Model allowlists, Agent+Model favorites, starred coding agents, starred themes, and remote validation. They can download the selected settings as a TOML file, or drop or select an exported file to import settings into the current project.

Name exported files `repoos_<repo>_export_<timestamp>.toml` and have them download to the user’s default Downloads folder.

## Acceptance criteria

- [ ] Settings includes a tab named **Import/Export**.
- [ ] The tab lets users choose which of the specified settings to include in an export.
- [ ] Export downloads the selected settings as a TOML file named `repoos_<repo>_export_<timestamp>.toml`.
- [ ] The export download uses the browser’s default Downloads location.
- [ ] The tab lets users import an exported settings file by dropping it onto the page or selecting it.
- [ ] Import applies settings from the selected file to the current project.

## Notes for AI

- Keep import/export focused on Agent+Model allowlists and favorites, starred coding agents, starred themes, and remote validation.
- Assume imports apply the settings present in the exported file to the current project; do not require users to manually edit TOML.
- Use the browser’s normal download behavior for the default Downloads location.

## Scope

This task covers the Settings tab and importing/exporting the listed settings. Other settings are outside scope.

## Original prompt

Now that I use repoos on multiple projects I need an easy way to copy important settings between projects, starting with Agent+Model allowlists and Agent+Model favorites and starred coding agents and starred themes and remote validation. Please create a new tab in settings page called "Import/Export" where the user can go to specify which things they want to export and also to drop/select a file to import it if they are bringing in exported settings from another project. The export button should download an "export toml" file with a name like `repoos_<repo>_export_<timestamp>.toml` and put it in your ~/Downloads folder by default.

## Shots
```json
[
{
"label": "Settings Import/Export tab with export options and import dropzone",
"target": "default",
"route": "/settings?tab=import-export",
"highlight": "#settings-panel-import-export"
}
]
```

## Activity

- 2026-10-14T08:01:16Z · created · hello@repoos.org
- 2026-10-14T08:01:44Z · status draft→inbox, title, area, body
- 2026-10-14T08:02:52Z · model_override
- 2026-10-14T08:03:10Z · status inbox→ready
- 2026-10-14T08:03:12Z · status ready→active, branch
- 2026-10-14T08:21:16Z · body
- 2026-10-14T08:25:01Z · body: section Shots
- 2026-10-14T08:31:55Z · status active→review
- 2026-10-14T08:32:51Z · note: review pass 1: good to go
