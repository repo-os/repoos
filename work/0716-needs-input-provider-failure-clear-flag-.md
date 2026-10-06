---
id: "0716"
title: "needs_input provider-failure: clear flag when a new run starts; show provider, model and real error line in detail"
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Acceptance criteria, Notes for AI; body under 400 characters (excluding original prompt)"
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-06T09:15:01Z"
updated_at: "2026-10-06T09:15:02Z"
---
Field report from tuk-private (RepoOS v0.5.66). Source rows in tuk-private/repoos/docs/repoos-feedback.md. Follow-ups to #0709: the flag stays set while a resumed run progresses, and needs_input_detail shows the raw first 500 chars of a JSON event.

## Activity

- 2026-10-06T09:15:01Z · created · unknown
- 2026-10-06T09:15:02Z · needs_input
