---
id: "0282"
title: Add interrupt/stop signal to AI chat
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-interrupt-stop-signal-to-ai-chat
created_at: "2026-08-24T17:34:28Z"
updated_at: "2026-08-24T19:51:24Z"
---
## Problem

When chatting with the PM, there is currently no way to interrupt or stop an
in-progress response. If the agent is mid-stream (producing a long response,
running a long task, or otherwise taking time), the user has no way to halt it.
This same limitation applies to AI chats generally, not just the PM — unless
there is a specific reason not to support interruption in a given chat, being
unable to stop a long-running response is a frustrating gap that wastes time and
leaves the user waiting with no control.

## Desired UX

A user chatting with the PM (and, by extension, any AI chat in RepoOS unless a
specific chat has a reason to opt out) should be able to send an
interrupt/stop signal at any point while a response is being generated or a
task is running. The signal should take effect promptly, and the user should get
clear feedback that the response was stopped.

- The stop control is available while a response/task is in progress.
- Sending the signal stops further output and cancels the in-flight work.
- The chat reflects the interruption (e.g. the partial response stops and is
  marked/interrupted) so the user knows it was user-initiated.

## Acceptance criteria

- [ ] A stop/interrupt control is visible while an AI chat response is in progress.
- [ ] Activating the control sends an interrupt/stop signal that halts the
      in-progress response.
- [ ] The interrupted response is clearly marked as stopped/interrupted rather
      than completed normally.
- [ ] The interrupt works for the PM chat specifically.
- [ ] The interrupt is available across AI chats generally, unless a specific
      chat has an explicit reason to opt out (and such opt-outs are intentional,
      not accidental).

## Notes for AI

- Examine how AI chat responses are streamed/executed in the current web UI and
  the server-side handling of long-running agent work.
- The scope should default to making interrupts work everywhere; only add an
  opt-out where there is an explicit reason. If no such reason exists today,
  implement it globally and note that no opt-out is currently needed.
- Consider both client-side rendering (warning the stream has been cancelled) and
  server-side cancellation of the in-flight task/response.
- Keep within the existing chat architecture; do not introduce new runtime
  dependencies without an explicit task authorizing them.

## Scope

- Covers: adding an interrupt/stop signal to the PM chat and to AI chats
  generally, including marking interrupted responses as stopped.
- Deferred: any chat-specific opt-out of interruption, since no concrete reason
  to opt out has been identified yet.

## Original prompt

If you're chatting with the PM you should be able to send an interrupt/stop signal (actually this should be true of all AI chats probably, unless you have reason not to)

## Activity

- 2026-08-24T17:34:46Z · status draft→inbox, title, area, body
- 2026-08-24T17:35:26Z · status inbox→ready
- 2026-08-24T17:35:46Z · status ready→active, branch
- 2026-08-24T18:04:43Z · status active→review
- 2026-08-24T19:34:58Z · status review→active
- 2026-08-24T19:41:31Z · status active→review
- 2026-08-24T19:51:24Z · status review→active
