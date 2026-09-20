---
updated_at: "2026-09-20T12:25:35Z"
review_passes: 1
id: "0463"
title: Add guided AI bug-report composer in Support
type: feature
status: review
priority: p1
area: support
assigned_to: ai
created_by: ""
branch: feat/add-guided-ai-bug-report-composer-in-sup
model_override: opencode-go/mimo-v2.5
review_model_override: opencode-go/hy3
created_at: "2026-09-20T09:02:32Z"
---
## Goal

Let a user describe a RepoOS problem naturally in Settings → Support, optionally attach local screenshots/files, and use the configured PM agent to turn it into an editable, GitHub-ready bug report.

## Flow

1. Add a clear **Describe a problem** action in Settings → Support.
2. Open a focused composer similar to New input: free-form description plus optional screenshots/files.
3. State clearly that notes and attachments stay local unless the user explicitly shares them. Warn against credentials, private source, and raw environment values.
4. Send a bounded, redaction-aware prompt to the configured PM agent. Generate an accurate concise title and an editable Markdown report with: expected behavior, actual behavior, smallest reproduction, environment/version, and an optional support-bundle reminder. Never invent facts; mark missing details for the user.
5. Show a review step where the user can edit title/body, copy each, and then optionally open GitHub. Do not automatically create or submit an external issue.
6. Keep the existing support-bundle flow available, and make attaching an already-inspected bundle an explicit user decision.

## Edge cases

- Explain how to continue manually when no PM agent is configured, unavailable, or fails.
- Keep attachments out of PM input unless their safe handling is explicitly implemented and the user opts in.
- Ensure generated content does not include credentials, repo paths, source contents, task bodies, raw logs, or private environment values.
- Keep the desktop and narrow/mobile layouts usable.

## Validation

Add focused tests for generation request/error states, edit/copy behavior, privacy copy, and the no-PM-agent fallback.

## Activity

- 2026-09-20T09:02:32Z · created · unknown
- 2026-09-20T09:06:46Z · status inbox→ready
- 2026-09-20T11:54:09Z · model_override
- 2026-09-20T11:54:12Z · review_model_override
- 2026-09-20T11:54:15Z · status ready→active, branch
- 2026-09-20T12:24:21Z · status active→review

