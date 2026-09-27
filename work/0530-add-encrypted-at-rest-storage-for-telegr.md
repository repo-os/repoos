---
id: "0530"
title: Add encrypted-at-rest storage for Telegram bot tokens
type: feature
status: inbox
priority: p1
area: core
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-27T07:32:02Z"
updated_at: "2026-09-27T07:32:02Z"
---
## Problem

A Telegram bot token must be treated as a password, and it must be recoverable — RepoOS has to re-send it on **every** `getUpdates` / `sendMessage` call. There is currently no way to store a secret that is both protected and replayable.

**This repo has no encryption code at all.** A grep for `createCipheriv|aes-|AES|encrypt|decrypt|scrypt|pbkdf2|chacha` across `src/**/*.ts` returns zero matches. Every existing credential is either plaintext in a gitignored `.env` (`loadDotEnv`, `src/core/config.ts:283`), hashed at rest (`hashSessionToken`, `hashOtp`, `src/core/auth.ts:62,78`), or stripped at the HTTP boundary (`safeConfigForBrowser`, `src/server/routes/config.ts:29`).

The closest existing precedent — Hub capability tokens (`src/core/hub-capabilities.ts`) — uses SHA-256 hash-at-rest with one-time plaintext display, and that approach is **unusable here**: hashing works only because RepoOS never needs the plaintext again. A bot token is the opposite case.

## What to build

An authenticated-encryption secret store, generic enough that the next credential reuses it:

- AES-256-GCM (Node `crypto`, no new dependency — zero-runtime-dependency is a hard constraint), or ChaCha20-Poly1305 if preferred. Per-record random IV, auth tag verified on read, and a clear failure on tag mismatch rather than a silent empty string.
- Key material from the environment only: `REPOOS_SECRET_STORE_KEY` (or a Telegram-specific name). **Never a `repoos.toml` key** — secrets in a git-tracked file is the exact mistake `REPOOS_RESEND_API_KEY` and `REPOOS_AUTH_DEV_BACKDOOR_CODE` already avoid, and `REPOOS_AUTH_DEV_BACKDOOR_CODE` is the precedent for a credential with no TOML key at all.
- If no key is configured, either generate one and persist it `0600` outside the repo working tree, or refuse to store a bot token. Decide deliberately and document which; do not silently fall back to plaintext.
- Round-trip through the store on every read, so a key rotation is a re-wrap rather than a re-provision.

## Boundary requirements

- `safeConfigForBrowser` must never carry a decrypted token to a client; the browser only ever sees connection *status*, never the secret.
- `src/core/redact.ts` already matches `*_TOKEN=` in `.env` and `bot_token` in its sensitive-assignment pattern, so support bundles should be covered — verify this against a real `TELEGRAM_BOT_TOKEN=` line rather than assuming it, and extend the patterns if any new shape slips through.
- Task worktrees: `worktreesInheritEnv` (`src/core/config.ts:225`) defaults to `false`, described as "the safe default is no secrets in worktrees." A worktree that inherits `.env` inherits the encryption key, and therefore the ability to decrypt every stored bot token. Confirm the key is not readable from a worktree, or document the exposure as accepted.

## Done when

- Encrypted round-trip, wrong-key, and tampered-ciphertext tests pass; a tampered record fails closed.
- The key never appears in `repoos.toml`, in any HTTP response, or in a support bundle.
- The failure mode when no key is configured is explicit and documented, not a plaintext fallback.

## Activity

- 2026-09-27T07:32:02Z · created · unknown
