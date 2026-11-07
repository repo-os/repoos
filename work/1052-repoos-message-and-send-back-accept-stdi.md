---
updated_at: "2026-11-07T12:54:58Z"
review_passes: 1
id: 1052
title: "repoos message and send-back: accept stdin, files and heredocs; never send junk as a message"
type: bug
status: review
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-message-and-send-back-accept-stdi
model_override: gpt-6.1-terra
created_at: "2026-11-07T07:57:47Z"
---
## Problem

`repoos message <id> "<text>"` builds the message from the command-line words only (`cmdMessage` in `src/commands/control-api.ts`: `rest.slice(1).join(" ")`). On 2026-11-07 a driver agent ran `repoos message 1049 - <<'EOF' ...` (a heredoc, the usual way to send multi-line text) and the engineer received the literal text `-`, twice, including a `--now` interrupt. A switch brief to a freshly started engineer was also just `-`. A later `repoos message 1047 --message-file <path>` sent the flag and path as the message text. Each time the command printed a green check, so nothing signalled that the text was wrong. The Haiku engineer on #1049 ignored the "instructions" because it never received any. `repoos send-back` has `--message` / `--message-file`, but rejects `-` ("Unexpected argument: -").

## Desired UX

- Every natural way of sending text works: inline words, `-` (read stdin, so heredocs and pipes work), `--file <path>` / `--message-file <path>` (same name as send-back), `--message "<text>"`, and a heredoc piped in with no text argument when stdin is not a terminal.
- `repoos send-back` accepts the same inputs, including `-` for stdin.
- Nothing wrong is sent silently: a bare `-` with no stdin, an unknown `--flag`, an empty or whitespace-only result and an unreadable file are all refused with a clear error and a non-zero exit.
- The success line shows what was sent: character count and the first line, so a one-character message is obvious.
- `--help`, `user-docs/cli.md` and the CLI flag table list the new inputs.

## Acceptance criteria

- Tests (table-driven) for each input path of `message` and `send-back`: inline words, `-` with stdin, stdin with no text argument, `--file`, `--message-file`, `--message`, and combinations that are refused (text plus `--file`, bare `-` on a terminal).
- Tests that an unknown flag, an empty message and a missing file exit non-zero without calling the API.
- Test that the success output includes the character count.
- The API-route parity test (`src/cli/api-route-parity.ts`) and the `--help` flag-table test still pass with the new flags.
- `user-docs/cli.md` and the AGENTS.md operating notes that mention `repoos message` are updated if they describe the old behavior.

## Notes for AI

- Start in `src/commands/control-api.ts` (`cmdMessage`, and the send-back command beside it) and `parseCommonFlags`. Reuse send-back's existing `--message-file` reader instead of writing a second one.
- Check other commands that take free text from the command line (`repoos note`, `repoos new --body -`, `repoos update --body -`) and make stdin handling consistent where it already exists; do not widen scope beyond message input unless it is a one-line reuse.
- Treat this as the class "silent success on a malformed CLI argument", not one instance: grep for other `rest.slice(` joins that send user text to the server.

## Activity

- 2026-11-07T07:57:47Z · created · njachowski@gmail.com
- 2026-11-07T12:42:06Z · status inbox→ready
- 2026-11-07T12:42:59Z · model_override
- 2026-11-07T12:43:16Z · status ready→active, branch
- 2026-11-07T12:47:39Z · body
- 2026-11-07T12:52:45Z · status active→review
- 2026-11-07T12:52:45Z · message_queued at 2026-11-07T12:52:45.550Z
- 2026-11-07T12:52:45Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-07T12:54:57Z · note: review pass 1: good to go

