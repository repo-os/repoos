---
id: "0197"
title: "bug: whisper vibe-coding dead on arrival — [whisper] unparsed, no key path, apiKey leaks to browser"
type: bug
status: ready
needs_merge: true
priority: p1
area: server + ui-app
assigned_to: ai
created_by: ""
branch: feat/bug-whisper-vibe-coding-dead-on-arrival-
model_override: default
created_at: "2026-08-14T12:41:38Z"
updated_at: "2026-08-16T01:33:18Z"
---
## Context

Task #0181 ("Add true vibe-coding capability in all text areas") was merged to main, but the feature is dead on arrival: mic buttons render **disabled** in every textarea, there is no way to enable them, and the config parsing the feature depends on was never wired up.

Reported by the human after merge: "I see microphone icon buttons on main, but I don't see any way to use it or to add a whisper API key."

## Root causes

1. **`[whisper]` is never parsed from `repoos.toml`.** `loadConfig()` in `src/core/config.ts` reads `[watchdog]`, `[tunnel]`, etc., but never reads `parsed["whisper.provider"]` / `parsed["whisper.apiKey"]`. `cfg.whisper` stays the hardcoded default `{ provider: "none", apiKey: "" }` (config.ts:129) no matter what the file says.
2. **No env-var fallbacks.** The task spec requires `REPOOS_WHISPER_KEY` / `GROQ_API_KEY` / `OPENAI_API_KEY` support; there are zero references to any of them in `src/`.
3. **No way to set a key from the UI.** `getConfigSchema()` has no whisper fields and `patchConfig` (`src/server/routes/config.ts:80`) only accepts schema fields, so Settings can't save a provider/key either.
4. **Security violation of the spec.** `readConfig` returns `{ ...repoos.config }` verbatim (`src/server/routes/config.ts:19`), which includes `whisper.apiKey`. If a key is ever set it will leak to the browser — directly contradicting the task's "the key must live only server-side... never reach the browser."

## Why the buttons are dead

`VoiceDictate.vue:23-26` enables the mic only when `config.form.whisper?.provider !== "none"`. Because parsing is broken, provider is always `"none"`, so every mic button renders permanently disabled with the tooltip "Voice transcription not configured".

## Secondary issues found during review

- `src/server/routes/transcribe.ts` returns `new Promise(() => { ... })` that never resolves; the router awaits the handler (`router.ts:43`), so each request leaks a pending dispatch. Response still goes out (written inside `req.on("end")`), but it should return a proper promise.
- The multipart body is hand-parsed via lossy `buffer.toString("binary")` + regex (`transcribe.ts:80-91`) — fragile for binary audio.
- Blob/type hardcoded to `audio/webm` (`transcribe.ts:88`, `VoiceDictate.vue:88`); Safari records mp4, so those recordings would be mislabeled.
- `insertTextAtCursor` is duplicated in `VoiceDictate.vue` and `utils/text-insertion.ts`.

## Fix path (for later)

- Parse `[whisper]` in `loadConfig` with env fallback (`REPOOS_WHISPER_KEY` / `GROQ_API_KEY` / `OPENAI_API_KEY`).
- Strip the key from `readConfig`; expose only a boolean (e.g. `whisperEnabled`) so the UI can show/enable mics without ever seeing the secret.
- Optionally add a guarded Settings field for provider + key so it's settable from the UI without hand-editing TOML.
- Fix the never-resolving promise and the multipart parsing in `transcribe.ts`.

## Acceptance criteria

- [ ] Setting `[whisper] provider + apiKey` in `repoos.toml` (or env) enables the mics without restart.
- [ ] `/api/config` never returns the apiKey or any secret.
- [ ] Recording → transcription → insert-at-cursor works end-to-end with a real key (Groq + OpenAI).
- [ ] With no key configured, mics are disabled with the tooltip and never error.
- [ ] `repoos check` passes.

## Activity

- 2026-08-14T12:41:38Z · created · unknown
- 2026-08-14T13:02:51Z · status inbox→ready
- 2026-08-15T17:58:01Z · model_override
- 2026-08-15T19:45:21Z · model_override
- 2026-08-16T01:33:18Z · needs_merge
