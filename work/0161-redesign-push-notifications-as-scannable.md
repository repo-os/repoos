---
id: "0161"
title: Redesign push notifications as scannable one-line events
type: feature
status: active
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/redesign-push-notifications-as-scannable
created_at: "2026-08-13T11:51:10Z"
updated_at: "2026-08-13T11:53:41Z"
---
## Problem

Push notifications currently read like audit log entries rather than notifications. On mobile the user should grasp the event from the first ~30–50 characters, but today the text is padded with repetitive words ("Task", quotation marks, "created", "(ready → active)") that bury the actual event:

```
RepoOS · 17m
Task "Add file tree navigation and refresh button to context page" started (ready → active)
```

Specific problems:

- The event isn't the headline; the task title and internal state plumbing dominate.
- Internal state transitions like `ready → active` leak into push notifications. Those belong in the RepoOS activity log, not the notification shade.
- Human-action notifications look identical to informational ones, so nothing surfaces when the agent is waiting on a decision.
- When an agent creates a task and immediately starts it, both "created" and "started" are pushed, doubling the noise for one meaningful change.

## Desired UX

Every push notification follows one grammar:

```
[emoji] [short human event] · [task/doc title]
```

The event is the headline; the task/doc title is secondary. One line is the hard preference — truncate the title, never the event.

Notification vocabulary (use only these, consistently):

| Event | Mobile notification |
| --- | --- |
| Task created | 🆕 New · <title> |
| Task started | ▶️ Started · <title> |
| Task completed | ✅ Done · <title> |
| Task blocked | 🚧 Blocked · <title> |
| Agent needs human | 🙋 Needs you · <title> |
| Agent created task for human | 👤 For you · <title> |
| Task failed | ❌ Failed · <title> |
| New doc | 📄 New doc · <title> |
| Doc edited | ✏️ Doc updated · <title> |

The icon + verb should communicate the event faster than the current verbose phrasing. The Android targets:

```
RepoOS · 17m
▶️ Started · Add file tree navigation…

RepoOS · 3m
🙋 Needs you · Decide how JSON stream events should be parsed
```

"Needs you" is a special case: because most RepoOS activity is autonomous, the notification shade should not train users to treat every notification equally. Human-action notifications must visually stand out from informational ones and can carry an extra line:

```
RepoOS · 3m
🙋 Needs you · Pick an authentication method
Agent is waiting for your decision
```

That makes the shade almost function as an agent inbox.

Notification priority is tiered: Done and Started are lower priority; Needs you, Blocked, and Failed trigger more prominent notifications. This matters as multiple agents run concurrently, or the shade becomes extremely noisy.

Dedup: when an agent creates a task and immediately starts it, push only the start:

```
▶️ Started · Strip ANSI from agent output
```

The underlying activity log still records both events. Push should report meaningful changes, not every event.

## Acceptance criteria

- [ ] Push notifications use the grammar `[emoji] [short human event] · [task/doc title]`
- [ ] The notification vocabulary above is implemented consistently for all supported event types
- [ ] Internal state transitions such as `ready → active` no longer appear in push notifications
- [ ] Titles are truncated before the event text; notifications stay on one line when possible
- [ ] "Needs you" notifications are visually distinct and include the "Agent is waiting for your decision" line
- [ ] Priority tiers are applied: Needs you, Blocked, Failed are prominent; Done and Started are lower priority
- [ ] Creating + immediately starting a task pushes only "Started", not both "New" and "Started"
- [ ] The activity log retains the full event detail (including state transitions like `ready → active`)

## Notes for AI

- Focus on the push notification generation path (server-side, event → notification text); the activity log is out of scope and must keep its current verbosity.
- Emoji in the notification string is intended as the primary visual signal; assume the platform renders it (the vocabulary above is the single source of truth for phrasing).
- When the title is long, truncate the title (ellipsis), never the event segment — the event must be readable in the first ~30–50 characters.
- "Blocked" means the agent cannot proceed; "Failed" means execution actually failed. Keep those distinct.
- "For you" is the notification shown when the agent creates a task for a human to pick up — it may carry the same special treatment as "Needs you" at the implementer's judgment, but it must at minimum be visually distinct from pure informational events.
- The prior verbose format (e.g. `Task "…" started (ready → active)`) should be removed from push text, not preserved alongside the new format.

## Scope

- Covers: notification copy/grammar, the notification vocabulary, the "Needs you" special case, priority tiers, and created/started dedup.
- Deferred: any per-user notification preferences/settings UI, and cross-agent aggregation beyond the priority tiers described here.

## Activity

- 2026-08-13T11:51:10Z · created · unknown
- 2026-08-13T11:53:39Z · status inbox→ready
- 2026-08-13T11:53:41Z · status ready→active, branch
