# Agent availability reminders

Reminders are personal notes under `reminders/<uuid>.md` by default, relative
to the repository root. The directory is configurable with `remindersDir` in
`repoos.toml`; a `repoos/` project gets `<namespace>/reminders` from
`repoos init`, and an existing project can relocate by setting the key and
moving the files (RepoOS never moves them). Notes are human-readable and
diffable. RepoOS does not commit each edit immediately, but routine reminder
changes can be checkpointed during close-out. Add and commit them explicitly
if you want shared Git history outside that process. They are currently repo-wide, visible to
authorized users of this server, not private per-user data.

```markdown
---
id: "00000000-0000-4000-8000-000000000001"
fire_at: "2026-10-22T09:00:00.000Z"
link: "agent:cursor"
done_at: ""
snoozed_at: ""
notified_fire_at: ""
created_at: "2026-10-19T09:00:00.000Z"
updated_at: "2026-10-19T09:00:00.000Z"
---
Check Cursor credit
```

The body is the note; timestamps are UTC instants. Links are optional typed ids
(`agent:<name-or-cli>`, `model:<cli>/<model>`, `provider:<id>`). The API offers known
CLIs, configured agents/models, budget allowlist models and registered providers.
It never probes external APIs to fill the dropdown. Unknown links and invalid
calendar dates are rejected on writes. Existing notes remain readable after their
linked entry is removed from configuration.

State is derived: done when `done_at` is set, due at `fire_at`, overdue after 24
hours, otherwise snoozed if `snoozed_at` is set or upcoming. Snoozing replaces
`fire_at`, clears completion and the notification occurrence. Changing a fire time
also reopens the note. Done/delete removes the live bell notice; reading or
dismissing ordinary notifications cannot hide an unresolved reminder.

The control-plane server checks at boot and every 30 seconds, using scheduled
tasks' hostile-environment guard (preview child/overrides, linked worktree,
ephemeral port) plus the Vitest guard. It is independent of scheduled task enablement.
There is no new configuration setting. Each due occurrence persists
`notified_fire_at` before emitting `reminder.changed`; repeated ticks and restart
catch-up do not emit duplicates. The bell derives one row per unresolved note
from the authoritative list, even if a tick/event was missed. SSE and 30-second
client polling reconcile updates. Atomic file replacements prevent partial reads.

API: `GET/POST /api/reminders`, `PATCH/DELETE /api/reminders/:id`, and
`POST /api/reminders/:id/done|snooze` (snooze body: `{ "fireAt": "ISO timestamp" }`).
The CLI uses the authenticated control-plane client, never offline file writes.

Reminders never start agents, resume entries or change configuration. The paused
allowlist quick-create/resume-on-Done integration is deferred until #0850 lands.
