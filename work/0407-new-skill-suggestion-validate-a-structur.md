---
id: "0407"
title: "New Skill Suggestion: Validate a structured CLI driver integration"
type: spec
status: inbox
priority: p2
area: agent
assigned_to: human
created_by: ""
branch: ""
created_at: "2026-09-18T10:53:31Z"
updated_at: "2026-09-18T10:53:31Z"
---
## Problem

Task #0406 (Add Antigravity CLI integration and deprecate Gemini CLI) completed a session that appears to contain a
non-trivial, reusable procedure: **Validate a structured CLI driver integration**.

This is an auto-generated suggestion from that session. Nothing is live as a
skill yet — approve it by turning the draft below into a skill file.

## Desired UX

If the draft is worth keeping, create `skills/validate-a-structured-cli-driver-integration/SKILL.md` from it (edit
as needed) and close this task the normal way. If it is not, close it and
discard the draft.

## Draft skill (SKILL.md)

```markdown
---
name: validate-a-structured-cli-driver-integration
description: Use when adding or updating a managed coding-agent CLI driver with a documented machine-readable protocol.
---

# Validate a structured CLI driver integration

## When to use

Use when RepoOS needs to support a CLI that emits structured output and has its own authentication, model-selection, permission, or session semantics.

## Procedure

1. Confirm the CLI’s official documented invocation, output modes, event protocol, model command, session/resume support, and permission flags before implementing parsing.
2. Add fixtures and deterministic fake-binary tests for the documented protocol, including initialization, streamed updates, terminal results, usage, malformed events, stderr failures, permission denial, version/auth failures, selected-model argv, and task-worktree cwd.
3. Implement parsing around the CLI’s actual event shapes rather than adapting another driver’s assumptions; make unknown events fail with a clear transcript message.
4. Surface terminal status, duration, selected model, and any reported usage, while providing one-time actionable recovery guidance for recognizable auth, permission, model, and version errors.
5. Preserve legacy configuration values without silently migrating them; add clear migration notices where saved deprecated values can appear.
6. Run the focused driver fixture suite, correct expectation or implementation mismatches, then run the TypeScript/UI build.
7. Run formatting and inspect the final diff for scope, documentation updates, and unintended changes before the full required check.
```

## Other candidate procedures

Identified in the same session but not turned into their own tasks (to avoid
spam). Mentioned here only:

- **Deprecate a legacy agent integration without data loss** — Preserve detection and saved configuration while making the replacement selectable and showing contextual migration guidance.

## Activity

- 2026-09-18T10:53:31Z · created · unknown
