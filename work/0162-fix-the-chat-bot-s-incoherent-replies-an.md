---
id: "0162"
title: Fix the chat bot's incoherent replies and rename it to Ross
type: bug
status: active
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: feat/fix-the-chat-bot-s-incoherent-replies-an
created_at: "2026-08-13T13:30:59Z"
updated_at: "2026-08-13T13:49:35Z"
---
## Problem

The always-available repository chat bot — the floating widget in the lower-right corner, currently named "RepoOS Guide" — has never once written a coherent reply. It regularly answers with raw JSON or an error instead of readable text, so the widget is effectively unusable. Separately, the user wants the bot renamed to "Ross" and given a personality inspired by Ross Geller from the 1990s TV show *Friends*.

## Desired UX

- The floating chat widget is titled "Ross", and the assistant introduces itself as Ross.
- Every ordinary question gets a coherent, human-readable markdown reply grounded in the repository — never raw JSON, escaped JSON, or leaked error payloads.
- Ross's voice takes inspiration from Ross from *Friends* (warm, witty, enthusiastic — the affable paleontologist) while staying concise, accurate, and helpful.

## Acceptance criteria

- [ ] Sending several ordinary questions in one session always produces coherent text replies; no raw JSON, escaped JSON, or error text appears in the conversation.
- [ ] The widget's display name is "Ross" everywhere a user can see it: launcher tooltip, header, welcome copy, status line, placeholders, and accessibility labels.
- [ ] The chat mission/persona instructs the agent to answer as "Ross", drawing inspiration from Ross from *Friends*, without dropping the existing grounding and read-only rules.
- [ ] Existing installs keep working: a stored agent list that still references the old name does not silently disable the chat.
- [ ] `repoos check` passes (build, typecheck, tests, UI smoke test).

## Notes for AI

- Likely touch points (confirm during investigation): `src/server/agents.ts` (`repoGuidePrompt` for the identity/persona, plus the streaming event parsers that turn CLI output into transcript entries — a JSON/error symptom usually means raw stream events are leaking into the transcript), `src/server/server.ts` (chat endpoints, the agent lookup, and error strings), `src/core/config.ts` (default agent name/instructions), `src/ui-app/src/components/RepoGuideChat.vue` (every user-visible name string), and `src/ui-app/tests/repo-guide.test.ts`.
- The root cause of the JSON/error replies is not yet confirmed — treat it as an investigation. Fix the leak at whatever layer it occurs (parser, streaming, or UI rendering); do not paper over it in the UI.
- The agent is resolved by name (`name.toLowerCase() === "repoos guide"`), and stored agent lists persist the old name. Renaming the default to "Ross" must keep a legacy-name fallback or migrate existing configs, or the chat silently stops resolving. The internal session id (`repoos-guide`) and file names may stay as-is.
- Persona: "inspired by" — Ross-flavored warmth and wit (enthusiasm, dry humor, the occasional paleontology nod) in the prompt string. Never at the expense of the existing Rules (concise, grounded, read-only). No new runtime dependencies — this is a string/prompt change, and zero runtime dependencies is a hard constraint.
- After any UI change, rebuild (`bun run build:ui`) and verify with a browser probe / managed preview before reporting done.

## Scope

- Covers: fixing incoherent replies, renaming the bot to Ross, and the Ross-inspired persona in the chat prompt.
- Deferred: any larger agent personality/config system beyond this chat widget, and changing the bot's launcher icon.

## Activity

- 2026-08-13T13:30:59Z · created · unknown
- 2026-08-13T13:34:33Z · status inbox→ready
- 2026-08-13T13:49:35Z · status ready→active, branch
