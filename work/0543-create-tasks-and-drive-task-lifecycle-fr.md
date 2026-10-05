---
id: "0543"
title: Create tasks and drive task lifecycle from Telegram
type: feature
status: ready
priority: p3
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-27T07:33:58Z"
updated_at: "2026-10-05T15:52:35Z"
---
## Problem

Story #0003 Phase 4 — the final phase, and the highest-risk one. Tasks #0529–#0542 built the Telegram identity/authorization model (ADR 0007), chat binding, the local adapter, the notification provider, Settings, read-only commands, guide chat, and task-agent follow-ups. Every one of those is read-mostly or advisory. This task is where a linked Telegram user can **write to the repository and move work through the pipeline**: create tasks, start/pause/resume agents, approve review transitions, attach files and screenshots, and route by group topic. That is why it is deliberately last, and why its guardrails are load-bearing rather than nice-to-have.

This is a slice of the story "RepoOS Telegram Bot" (#0003). Its Phase 4 is: create tasks from Telegram; start, pause, and review tasks; file and screenshot attachments; optional group/topic routing. Its security requirements only start to bite once write access exists: hard rate limits on actions that spawn agent processes and spend tokens, a confirmation step for anything that merges, signed single-use inline buttons re-authorized at press time, and audit via `logAudit` with the presser's allowlisted email.

The write path must reuse RepoOS's existing machinery rather than fork it. Task creation goes through the same `repoos.createTask` path the UI uses — RepoOS's own rule is that task files are never hand-edited, and a bot is not an exception. Status transitions go through the same start/pause/close-out orchestration the HTTP routes use. Attachments go through the existing `work/.attachments/` storage convention. A Telegram-only task format, a hand-written markdown file, or a second agent runtime would violate the repo's architecture and produce tasks that are not structurally identical to UI-created ones.

Security is the whole point of the ordering. A `member` must be able to perform no action in this task's scope; a demoted `admin` must lose access on their very next interaction; a replayed or expired inline button must be rejected even when its original renderer was an admin; and approving a move to `done` — which merges a branch — must never happen from a single mis-tapped inline button in a group.

Existing state to build on: the adapter already sends `replyMarkup` (`src/server/telegram/api.ts:311`) and normalizes `callback_query` (`TelegramCallbackQuery` in `src/server/telegram/types.ts`), but the intake currently only audits callbacks — no handler consumes them. `src/server/telegram/intake.ts` registers exactly one `onAuthorized` sink, composed from the #0540 command handler and #0541 agent chat; this task must join that chain, not add a second sink.

## Desired UX

### Creating a task

An admin sends `/newtask <free-form prose>` (or replies to a message with `/newtask`) and may attach files, screenshots, or a voice message. The bot infers a title, type, priority, and area, then replies with a **preview card that commits nothing**: it shows the exact title, type, priority, area, and body that will be filed, with inline buttons **Create**, **Edit**, and **Cancel**.

- `Edit` lets the admin correct one field at a time (title / type / priority / area) and re-renders the preview after each change.
- If the prose is ambiguous enough that a wrong guess would be expensive, the bot asks a specific question instead of guessing.
- On `Create`, the task is created through the normal RepoOS path, committed, and the bot replies with the new id, title, and a link into the web UI.
- A `member` never sees a Create button; a `member` who somehow presses one is refused with a role explanation (they are an authorized sender, so this is not an ADR-0007 silent no-op).

### Driving the lifecycle

Notifications that represent an opportunity to act (task ready, agent needs input, task in review) or a running agent carry inline buttons for the admin actions that apply: **Start**, **Pause**, **Resume**, **Request review**, and **Move to done**.

- **Move to done is destructive** — it merges a branch. It never happens from one tap: the first press shows a confirm card naming the repository, task id/title, and the exact branch about to be merged, and only a second explicit **Confirm merge** press runs the close-out pipeline. Cancel leaves everything untouched.
- Every action reports its outcome in the chat it was invoked from, including honest failure text (task not found in this repository, agent already running, branch did not merge, rate limit applies).

### Attachments

- Files, screenshots, and voice messages are supported on the creation flow. Images land on the created task's `## Screenshots`; other files are referenced from the body. The bot validates the actual bytes — size and type sniffed from content, never the declared MIME type or filename — and stores everything under `work/.attachments/<taskId>/`. The committed record is the markdown; no binary is ever tracked.
- A voice message is transcribed and treated as prose for the creation flow.

### Groups and topics

- All of the above works in a bound group under the existing trigger rules (a command addressed to the bot, a reply to a bot message, or an `@mention`), and respects the existing per-chat serialization so group bursts do not interleave.
- When a message arrives in a forum topic, replies and action cards go back to the same topic (`message_thread_id`). Routing is by chat and, when present, by topic — never by Telegram username. Topic support is genuinely optional and must not become a requirement for the private-chat or plain-group cases.

### Members

A `member` can still read, be notified, and answer a permitted needs-input question. They cannot create tasks, start/pause/resume agents, request review, or approve a move to `done`; the bot tells them which boundary applies rather than silently ignoring them.

## Acceptance criteria

- A `member` can perform no write action in this task's scope — creation, start/pause/resume, review, move to done, and attachment upload are all refused with a role explanation, proven by test.
- A demoted `admin` (role changed to `member` in `auth_users`) is refused on their next action with no restart or re-linking required, proven by test.
- Inline button payloads are signed, single-use, and short-lived. A replayed payload, an expired payload, and a payload rendered for an admin but pressed by a `member` are each rejected — proven by test.
- Button presses re-resolve the presser's live role from `auth_users` at press time; the role embedded at render time is never trusted.
- A move to `done` cannot happen from a single tap: a test proves the first tap starts no close-out/merge and that Cancel is a no-op, and the confirm card names repository, task id/title, and branch.
- Creation-rate and action-rate limits are enforced before any task is created or agent started; a refusal is reported to the authorized sender and audited. The limits live alongside the existing Telegram general/agent limiters.
- Tasks created from Telegram are structurally identical to UI-created tasks — same frontmatter keys and serialization, same body/section shape, same activity entry, same commit message — pinned by a test that creates equivalent input both ways and compares.
- Free-form prose is preserved under `## Original prompt`; inferred title/type/priority/area are validated against each field's allowed set and never coerced to an invalid value.
- Every privileged action writes a `logAudit` row whose `actorEmail` is the presser's allowlisted email and whose action is a `TELEGRAM_AUDIT` name; no `"human"` fallback appears.
- Attachments are validated by content, not declared type or filename; oversize and disallowed types are rejected before storage; stored files live under `work/.attachments/` and `repoos check`'s task-asset guard passes (nothing tracked under `work/`).
- Group trigger rules and per-chat serialization are preserved; a forum-topic message routes its reply to the same topic; the private-chat and plain-group cases need no topic configuration.
- The existing read-only commands, guide chat, and `/msg` follow-ups continue to behave unchanged, composed through the single `onAuthorized` chain.

## Notes for AI

**Reuse, do not fork.** Create through `repoos.createTask` exactly as the HTTP route does (`src/server/routes/tasks.ts:204`): pass `createdBy` = `actor.email`, set `originalPrompt` for the free-form prose so it lands under `## Original prompt`, then `index.applyFileChange(absPath)` and `commitTaskFile(root, absPath, `docs(${id}): add task`)`. Pin structural parity in a test by parsing/serializing the created file and comparing against the UI path. Never call `repoos mv <id> done` for completion — it only edits frontmatter.

**Join the one `onAuthorized` chain.** Extend `TelegramCommandDeps` (`src/server/telegram/commands.ts`) the way #0542 added `agentChat`; do not register a second intake sink. The intake already audits `callback_query`, but no handler consumes it today (the command handler returns early for non-command updates), so add a callback path. A new module such as `src/server/telegram/task-actions.ts` (creation + transitions) plus a callback router is the natural shape.

**Command-name collision.** Bare `/new` is already owned by guide chat as "reset the conversation" (`src/server/telegram/guide-chat.ts:250`, and it is a silent fall-through in `commands.ts`). Do not take `/new` for task creation; pick e.g. `/newtask` and update the bot command menu (`setMyCommands`) and `/help`.

**Field inference.** Decide deliberately between a conservative deterministic parse (ask on low confidence) and reusing the freeform PM path (`src/server/freeform.ts`, `pmPrompt`, `parseGeneratedTask`, `pm-attachments.ts`, `freeform-runs.ts`; #0036/#0403). If you use an LLM one-shot, you MUST call `recordOneShotSession(root, agent, result, { sessionType, taskId })` immediately after the await (AGENTS.md); pick a `sessionType` that keeps the by-role breakdown legible — not `pm` unless a real PM agent authored it. Either way, show the inferred fields and require confirmation.

**Inline buttons.** `TelegramSendOptions.replyMarkup` already reaches the Bot API (`src/server/telegram/api.ts:311`). Define a payload carrying `{ action, taskId, nonce, exp }`, HMAC-sign it with a server secret, and store/consume the nonce once. Reuse the short-lived single-use pattern already in the repo (`src/core/telegram-chat.ts` — `signTelegramChatBind`, `hashOtp`, TTL — or the invite pattern in `src/core/telegram-identity.ts`). On press: reject expiry/replay, re-resolve the presser's live role via `resolveTelegramSender`, then check it against the action's required role.

**Transitions.** `start` reuses the `POST /api/tasks/:id/start` orchestration; `pause` matches `POST /api/tasks/:id/pause` (task stays active, agent stopped, #0070); move-to-done reuses the close-out pipeline behind `POST /api/tasks/:id/done` (`src/server/done.ts`, `docs/close-out-pipeline.md`). Confirm the task belongs to this repository through the live index and pad short ids exactly like agent chat, so a cross-repo id and a nonexistent id are indistinguishable.

**Rate limits.** Add a tighter limiter for creation and for transition/merge actions to `src/server/telegram/rate-limits.ts`, consumed before any work is queued. Follow the #0541 pattern: a refusal for an authorized sender is answered via the handler meta (not dropped silently) and recorded in audit.

**Attachments.** Telegram supplies a `file_id`; download via the Bot API (`getFile` + file download) through `src/server/telegram/api.ts`. Validate by content — cap size (reuse `MAX_SCREENSHOT_BYTES`, currently 10 MB, as a start) and sniff magic bytes; never trust the declared MIME or filename. Note that the existing `saveScreenshot` (`src/server/attachments.ts`) trusts the caller's `mime`, so add sniffing before storage or a sibling helper. Store under `work/.attachments/<taskId>/` via the storage provider; reference images from `## Screenshots` (`appendScreenshotsSection`) and other files from the body. Never `git add` them. Voice transcription should reuse the existing transcribe logic; if it is an LLM call, record its usage too.

**Topic routing.** Add an optional `messageThreadId` to `TelegramMessage` (`src/server/telegram/types.ts` + `normalize.ts`) sourced from `message.message_thread_id`, and thread replies/action cards to it when present. Chat binding remains the authorization boundary; a topic is routing only. Never route or authorize by username (ADR 0007).

**Audit.** Extend `TELEGRAM_AUDIT` (`src/core/telegram-identity.ts`) with the new action names, and write rows via `store.logAudit(action, actorEmail(actor), actorEmail(actor), JSON.stringify(details))` using `TelegramActor` / `actorEmail` (`src/server/telegram/actor.ts`). Never use `getCurrentUser(...) ?? "human"`.

**Config and docs.** `telegram.enabled` already gates intake; prefer no new `repoos.toml` keys. If you add a user-facing feature toggle, AGENTS.md requires a `getConfigSchema()` entry, a Settings control, docs, and a test in the same change; secrets stay env-only. Update `docs/telegram-adapter.md` with a "Task creation and lifecycle" section, `docs/adr/0007-telegram-identity-and-authorization.md` if the action/authorization model sharpens it, the Phase 4 text in `stories/repoos-telegram-bot.md` if behaviour differs, and `user-docs/` for user-facing commands.

**Tests and constraints.** Follow the existing `src/ui-app/tests/telegram-*.test.ts` patterns; add coverage for creation preview/confirm/edit, callback signing/replay/expiry/re-auth, member refusal and demotion, merge confirmation, attachment sniffing and no-git-tracked binaries, and structural parity with UI-created tasks. Zero runtime dependencies; TypeScript/NodeNext import style (`.js` extensions); run `bun run fmt` and `repoos check --changed main` before requesting handoff.

## Activity

- 2026-09-27T07:33:58Z · created · unknown
- 2026-09-27T15:42:41Z · body
- 2026-09-27T15:51:58Z · body
- 2026-09-27T15:52:49Z · body
- 2026-09-28T11:43:55Z · status inbox→ready
- 2026-10-05T11:15:32Z · needs_input
- 2026-10-05T15:49:02Z · needs_input
- 2026-10-05T15:52:35Z · body
