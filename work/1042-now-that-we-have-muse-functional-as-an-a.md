---
id: 1042
title: Add Muse usage details and provider navigation
type: feature
status: review
priority: p2
area: [ui, server]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-muse-usage-details-and-provider-navi
created_at: "2026-11-06T10:56:43Z"
updated_at: "2026-11-06T13:25:42Z"
review_rounds: 1
routing_switches: 1
review_passes: 1
last_check_failure: "repoos check at 2026-11-06T12:12:05.932Z: repoos check failed: ui verification failed (8 issue(s)): [request] HTTP 400 for http://127.0.0.1:59681/api/model-providers/muse/usage (http://127.0.0.1:59681/api/model-providers/muse/usage); [request] Failed to load resource: the server responded with a status of 400 (Bad Request) (http://127.0.0.1:59681/api/model-providers/muse/usage); [request] HTTP 400 for http://127.0.0.1:59681/api/model-providers/muse/usage (http://127.0.0.1:59681/api/model-providers/muse/usage); [request] Failed to load r… (truncated)"
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
"highlight": ".mp-provider-nav",
"steps": [
{
"waitFor": ".mp-provider-nav"
},
{
"waitMs": 1500
}
]
},
{
"label": "Muse subscription allowance row with login hint",
"target": "default",
"route": "/agents?tab=providers",
"highlight": "[data-provider-id=\"muse\"]",
"steps": [
{
"waitFor": "[data-provider-id=\"muse\"]"
},
{
"waitMs": 1500
}
]
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
- 2026-11-06T11:44:52Z · note: ui verification failed (1 issue(s)): [missing-target] Provider quick-nav chips at top of Model providers (target "default"): loading state detected: loading indicator [aria-busy="true"] on /agents?tab=providers (http://127.0.0.1:56404/agents?tab=providers)
- 2026-11-06T11:44:52Z · message_queued at 2026-11-06T11:44:52.922Z
- 2026-11-06T11:44:56Z · message_delivered: 1 message(s)
- 2026-11-06T11:46:08Z · body
- 2026-11-06T11:51:08Z · body
- 2026-11-06T11:56:45Z · CTO nudge: held — handoff gate is running
- 2026-11-06T12:12:02Z · note: ui verification failed (8 issue(s)): [request] HTTP 400 for http://127.0.0.1:59681/api/model-providers/muse/usage (http://127.0.0.1:59681/api/model-providers/muse/usage); [request] Failed to load resource: the server responded with a status of 400 (Bad Request) (http://127.0.0.1:59681/api/model-providers/muse/usage); [request] HTTP 400 for http://127.0.0.1:59681/api/model-providers/muse/usage (http://127.0.0.1:59681/api/model-providers/muse/usage); [request] Failed to load resource: the server r
- 2026-11-06T12:12:02Z · message_queued at 2026-11-06T12:12:02.572Z
- 2026-11-06T12:12:05Z · message_delivered: 1 message(s)
- 2026-11-06T12:16:44Z · body
- 2026-11-06T12:21:45Z · CTO nudge: held — handoff gate is running
- 2026-11-06T12:29:54Z · status active→review
- 2026-11-06T12:29:55Z · message_queued at 2026-11-06T12:29:55.424Z
- 2026-11-06T12:35:40Z · note: review pass 1: needs some work
- 2026-11-06T12:35:43Z · message_delivered: 1 message(s)
- 2026-11-06T12:35:43Z · status review→active
- 2026-11-06T12:35:46Z · CTO nudge: held — remote validation is running
- 2026-11-06T12:41:45Z · CTO nudge: held — remote validation is running
- 2026-11-06T12:46:14Z · body
- 2026-11-06T12:51:45Z · CTO nudge: held — handoff gate is running
- 2026-11-06T13:06:29Z · message_queued at 2026-11-06T13:06:29.743Z
- 2026-11-06T13:06:45Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-06T13:11:49Z · message_delivered: 1 message(s)
- 2026-11-06T13:11:51Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-06T13:17:55Z · body
- 2026-11-06T13:22:48Z · status active→review
- 2026-11-06T13:25:42Z · note: review pass 2: needs some work
