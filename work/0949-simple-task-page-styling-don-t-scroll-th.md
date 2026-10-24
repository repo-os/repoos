---
id: "0949"
title: Fix page scrolling and Secrets layout
type: feature
status: inbox
priority: p2
area: [web, ui]
assigned_to: ai
created_by: hello@repoos.org
branch: ""
cli_override: cursor
model_override: default
pm_cli_override: codex
pm_model_override: gpt-6-luna
created_at: "2026-10-24T16:04:07Z"
updated_at: "2026-10-24T16:05:00Z"
---
## Problem

Several pages scroll as a whole, moving the header, title, and tabs out of view. The Secrets page also does not match the full-width layout used by the other pages, and its key entries show redundant source information.

## Desired UX

On Control, Stories, Checks, Releases, Deployments, Dev, Secrets, and Settings, keep the header and title stationary while the content below scrolls. Keep tabs stationary too on pages that have them. Match the Secrets page layout to Dev, with each key displayed in its own card and the selected environment’s filename shown above the key inventory. Do not repeat the source on each secret entry.

## Acceptance criteria

- [ ] On Control, Stories, Checks, Releases, Deployments, Dev, Secrets, and Settings, scrolling moves the content below the header and title while keeping them stationary.
- [ ] On pages with tabs, scrolling keeps the tabs stationary along with the header and title.
- [ ] The Secrets page uses the same full-width styling as the Dev page.
- [ ] Each key in the Secrets inventory appears in its own card.
- [ ] The selected environment’s filename appears above the key inventory.
- [ ] Secret entries do not repeat the source when it is already determined by the selected environment.

## Notes for AI

- Inputs, Work, Agents, and Context already have the desired scroll behavior; use them as references. The Agents page is a reference for keeping the title and tabs stationary while content scrolls.
- Use the Dev page as the reference for Secrets page width and key card styling.
- Assume “header and title” refers to the page’s existing header and title area; preserve the existing page structure and styling beyond the requested changes.

## Original prompt

Simple task: page styling, don't scroll the whole body of the page, keep the header/title and tabs stationary and let the rest below scroll.

Good already: Inputs, Work, Agents, Context (I included a screenshot of a good page, Agents page : scroll below the title and tabs (if tabs exist))
Fix these pages scroll behavior: Control, Stories, Checks, Releases, Deployments, Dev, Secrets, Settings

Also all the pages are full-width except Secrets page, so please fix the Secrets page styling to match that of Dev page (e.g. each key should be it's own card) 

And on secret entries you don't need to mention the source on each, because they're all the same once you choose the env at the top (so do show the filename above the key inventory).

## Screenshots

![Screenshot-2026-10-25-at-00.02.19](/api/tasks/0949/attachments/att_9ea94016-0c1d-43e6-bebd-0de3c2c1d0a7.png)

## Activity

- 2026-10-24T16:04:07Z · created · hello@repoos.org
- 2026-10-24T16:04:16Z · screenshots
- 2026-10-24T16:04:22Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-10-24T16:05:00Z · cli_override, model_override
