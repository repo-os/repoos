---
id: 1042
title: Add Muse usage details and provider navigation
type: feature
status: active
priority: p2
area: [ui, server]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-muse-usage-details-and-provider-navi
created_at: "2026-11-06T10:56:43Z"
updated_at: "2026-11-06T11:31:45Z"
---
## Problem

Muse is now a functional AI coding agent but is not represented in the Model Providers tab. Users also lack a quick way to navigate to a particular provider on that page.

## Desired UX

The Model Providers tab includes Muse and shows its usage and subscription details when they can be pulled in automatically, preferably following the OpenCode Go pattern. If those details cannot be pulled in, provide a link to Muse. A row at the top of the page lists all model providers and lets users navigate to the corresponding provider section, similar to the Settings page’s General tab.

## Acceptance criteria

- [ ] Muse appears in the Model Providers tab.
- [ ] The page automatically displays Muse usage and subscription details when available, following the existing OpenCode Go pattern where applicable.
- [ ] If Muse details cannot be pulled in, the page provides a link to Muse.
- [ ] A row at the top of the Model Providers page lists all providers and lets users navigate to each provider’s section.
- [ ] Provider navigation follows the existing pattern used in the Settings page’s General tab.

## Notes for AI

- Use the existing OpenCode Go implementation as the preferred precedent for pulling in usage and subscription details.
- Use the Settings page’s General tab as the precedent for the provider navigation row.
- The explanation does not specify which Muse details are available or how to retrieve them. Use existing integration patterns and provide the Muse link when automatic retrieval is not available; do not assume a particular data source or add unrelated provider features.

## Scope

This task covers adding Muse to the Model Providers tab, displaying its usage and subscription details or a fallback link, and adding provider navigation at the top of that page.

## Shots
```json
[
{
"label": "Provider quick-nav chips at top of Model providers",
"target": "default",
"route": "/agents?tab=providers",
"highlight": ".mp-provider-nav"
},
{
"label": "Muse subscription allowance row with login hint",
"target": "default",
"route": "/agents?tab=providers",
"highlight": "[data-provider-id=\"muse\"]"
}
]
```

## Original prompt

Now that we have muse functional as an AI coding agent let's also add it to the "model providers" tab and try to automatically pull in it's usage/subscription details there (and fallback to linking out to it...but preferably pull it in to this page like we do with opencode-go). Also on the model providers page let's show a row of all the model providers at the top for easier navigation to automatically scroll to the provider of interest (similar to the Settings page General tab).

## Screenshots

![Screenshot-2026-11-06-at-18.52.45](/api/tasks/1042/attachments/att_582922cb-41c5-4308-93ed-089a4a3701b7.png)
![Screenshot-2026-11-06-at-18.53.09](/api/tasks/1042/attachments/att_5b152270-ab8e-42c5-8e21-db3c93abf181.png)

## Activity

- 2026-11-06T10:56:43Z · created · hello@repoos.org
- 2026-11-06T10:56:46Z · screenshots
- 2026-11-06T10:56:46Z · screenshots
- 2026-11-06T10:57:18Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added)
- 2026-11-06T10:57:48Z · status inbox→ready
- 2026-11-06T10:57:59Z · status ready→active, branch
- 2026-11-06T11:13:18Z · body
- 2026-11-06T11:17:32Z · body
- 2026-11-06T11:23:04Z · body
- 2026-11-06T11:31:45Z · CTO nudge: held — handoff gate is running
