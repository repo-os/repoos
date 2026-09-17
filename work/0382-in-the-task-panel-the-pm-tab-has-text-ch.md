---
id: "0382"
title: "Screenshot upload in the PM chat tab, and never lose task screenshots"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/screenshot-upload-in-the-pm-chat-tab-and
model_override: opencode-go/minimax-m3
review_model_override: opencode-go/hy3
created_at: "2026-09-17T05:19:55Z"
updated_at: "2026-09-17T07:01:17Z"
handoff_signal_retry_count: 1
dev_error_count: 1
---
## Original prompt

In the task panel the PM tab has text chat but no way to add screenshots, let's add screenshot upload in that chat  (a small button is good, see attached screenshot) and the PM agent should be able to include screenshots in the task spec if appropriate (likely any screenshots provided to the PM for a task should be included / linked to in the task somewhere). also if an input has screenshots and it gets turned into a task those screenshots should always be included in the task. and check that tasks can never lose screenshots when the task md file is edited (I think we discussed this before but I'm not sure if there are tests to cover that case)

## Screenshots

![Screenshot-2026-09-17-at-13.19.44](/api/tasks/0382/attachments/screenshot-1.png)

## Activity

- 2026-09-17T05:19:55Z · created · hello@repoos.org
- 2026-09-17T05:19:56Z · screenshots
- 2026-09-17T05:21:21Z · status draft→inbox, title, area, body
- 2026-09-17T05:32:19Z · model_override
- 2026-09-17T05:32:30Z · review_model_override
- 2026-09-17T05:32:32Z · status inbox→ready
- 2026-09-17T05:32:34Z · status ready→active, branch
- 2026-09-17T05:32:37Z · agent exited with an error (opencode) · error: No endpoints found that support tool use. Try disabling "bash". To learn more about provider routing, visit: https://openrouter.ai/docs/guides/routing/provider-selection
- 2026-09-17T06:13:17Z · model_override
- 2026-09-17T06:13:19Z · needs_input
- 2026-09-17T07:01:17Z · body
