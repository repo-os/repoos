---
id: "0543"
title: Create tasks and drive task lifecycle from Telegram
type: feature
status: inbox
priority: p3
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-27T07:33:58Z"
updated_at: "2026-09-27T15:42:41Z"
---
## Problem

Story #0003 Phase 4: create tasks from free-form messages, start/pause/review tasks, file and screenshot attachments, optional group/topic routing.

This is the highest-risk phase and the last one. Every prior task is read-mostly or advisory; this one lets a Telegram user **write to the repository and move work through the pipeline**, which is why it is deliberately last and why the guardrails below are not optional.

## Guardrails that must be in place before this ships

- **Task creation and status transitions are admin-only**, resolved live from `auth_users` on each action. A `member` can read, be notified, and answer a needs-input question if permitted; a `member` cannot create tasks, start agents, or approve a move to `done`.
- **Rate limit hard.** These actions spawn real agent processes and real LLM spend. A creation command is the single most expensive Telegram action; a group makes it easy to spam. Enforce the limit before any work is queued, and report when it applies.
- **Confirm destructive transitions.** Approving a move to `done` merges a branch. A mis-tapped inline button in a group should not merge code. Require an explicit confirm step for anything that merges, and show exactly what is about to happen — repository, task, branch.
- **Inline buttons carry a signed, single-use, short-lived payload** and must be re-authorized at press time against the presser's live role. A button rendered for an `admin` must not be replayable later by a `member`, or by anyone after that admin is demoted. Re-check authorization when the button is pressed, not only when it was rendered.
- **Audit every privileged action** through `logAudit`, with the presser's allowlisted email as `actorEmail`.

## Task creation

- Create through the normal RepoOS task-creation path so frontmatter, activity entries, and commits stay consistent. RepoOS's own rule is that task files are never hand-edited — the same discipline applies to a bot, and this is precisely the case where bypassing it would be tempting.
- Free-form Telegram prose needs a title, a type, a priority, and an area. Infer what is reasonable, **show the user what will be created, and let them correct it before it is committed.** A bot that silently files a mis-parsed request as a task is worse than one that asks.
- If the message is ambiguous enough that a wrong guess would be expensive, ask rather than assume.

## Attachments

Files, screenshots, and voice messages. Two hard constraints: attachments are user content arriving from outside, so validate size and type and never trust a declared content type or filename; and the repo's own rule is that **binaries are never tracked under `work/` or `inputs/`** — uploads belong in `work/.attachments/` (gitignored, served from disk by the running server), and the committed record is the markdown.

## Group and topic routing

Optional, and genuinely optional. Topic routing is worth supporting for a project group with parallel workstreams, but it must not become a requirement for the common case. Route by chat, and by topic within a chat where one is present — never by Telegram username.

## Done when

- A `member` can perform no action in this task's scope; a demoted `admin` loses access immediately.
- Every inline button re-authorizes at press time, and a replayed or expired button is rejected, proven by test.
- A merge-affecting transition cannot happen from a single unconfirmed tap.
- Tasks created from Telegram are byte-identical in structure to tasks created in the UI, and no attachment is ever tracked in git.

## Decision reference

Follow [ADR 0007 — Telegram identity and authorization](../docs/adr/0007-telegram-identity-and-authorization.md) for the shared identity, role-resolution, chat-binding, and sender-response policy. This task implements its specific flow.

## Activity

- 2026-09-27T07:33:58Z · created · unknown
- 2026-09-27T15:42:41Z · body
