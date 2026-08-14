---
review_rounds: 2
id: "0181"
title: Add true vibe-coding capability in all text areas like th…
type: feature
status: review
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/add-true-vibe-coding-capability-in-all-t
created_at: "2026-08-13T17:57:26Z"
updated_at: "2026-08-14T00:35:42Z"
---
## Context

RepoOS's UI is full of freeform text areas — the new-task "Describe the task" box, the task spec editor in the drawer, new-doc description/body, agent instructions, the PM compose box, and the RepoOS Guide chat box — but everything is typed. The goal is "true vibe-coding": a mic button beside each text area that records speech and transcribes it into the field at the cursor position.

Voice is **opt-in**: the user brings their own speech-to-text API key (OpenAI Whisper or Groq) to enable it. With no key configured the mic affordance is hidden/disabled and never errors.

## Scope — which text areas

All of these get a mic button (one reusable Vue component, injected at each site):

- Task drawer — freeform "Describe the task" (`#nt-freeform`), the spec-body textarea, and the follow-up/message compose textareas
- New doc panel — freeform description + doc body (NewDocPanel.vue)
- Agents page — agent Instructions textareas (AgentsView.vue)
- Product manager view — compose textarea (ProductManagerView.vue)
- RepoOS Guide — chat compose textarea (RepoGuideChat.vue)

## Provider recommendation

Recommend **Groq `whisper-large-v3`** as the primary provider: near-real-time transcription, ~$0.04 per audio hour, OpenAI-compatible endpoint. **OpenAI Whisper (`whisper-1`)** is a drop-in second provider through the same code path. Optional zero-config tier (flagged as stretch): the browser-native Web Speech API — no key needed, but Chromium/Safari only and less accurate; useful as a free fallback when no key is set.

## Configuration

New optional `[whisper]` section in `repoos.toml`, parsed in `src/core/config.ts`:

```toml
[whisper]
provider = "groq"   # "groq" | "openai" | "none"
apiKey  = ""        # or set REPOOS_WHISPER_KEY / GROQ_API_KEY / OPENAI_API_KEY in the env
```

If `provider`/`apiKey` resolve to nothing, voice is disabled (mic hidden). The key must live only server-side — in config/env — and never reach the browser.

## Desired UX

- Small mic button beside each target textarea (or in the field's corner).
- Click to start recording → button pulses red with elapsed time; click again to stop → transcription is inserted at the cursor position.
- Cancel button while recording discards the audio.
- Transcribing state while the request is in flight; an empty transcription resolves quietly ("nothing heard").
- Mic hidden (or disabled with a tooltip) when no key is configured.
- Only one recording at a time app-wide; starting a new one stops the previous.
- Recordings capped at ~2 minutes.

## Architecture

- **UI** — new `src/ui-app/src/components/VoiceDictate.vue`: mic button + tiny state machine (`idle → recording → transcribing → done/error`). Uses `navigator.mediaDevices.getUserMedia({ audio: true })` + `MediaRecorder`, collects chunks into a Blob, POSTs the bytes to the local server, and emits the transcribed text for the parent to insert at the textarea's cursor.
- **Server** — new `POST /api/transcribe` route (e.g. `src/server/routes/transcribe.ts`): receives the audio blob, reads provider + key from config/env, proxies to `POST <providerBase>/v1/audio/transcriptions` (Groq: `https://api.groq.com/openai/v1/audio/transcriptions`, model `whisper-large-v3`; OpenAI: `https://api.openai.com/v1/audio/transcriptions`, model `whisper-1`) and returns `{ text }` or `{ error, status }`. Plain read-mostly route — no index/status wiring needed.
- **No new runtime dependencies** (hard constraint): built-in `fetch` + `FormData` (Bun, Node ≥ 20) for the provider call; `MediaRecorder` in the browser. No `form-data`, `mic-recorder`, or `openai` packages.

## Edge cases

- Mic permission denied → friendly inline error on the button, never a crash.
- Provider returns 401/429/500 → surface a readable message ("check your API key"); never log the key.
- Keyed providers work in every browser (MediaRecorder + fetch are standard), so voice is not limited to Chromium/Safari.
- MediaRecorder emits `audio/webm;codecs=opus` in most browsers — confirm the chosen provider accepts webm/opus; if it does not, prefer a browser MIME it does accept (`audio/webm` vs `audio/mp4`) over adding a transcode dependency.

## Acceptance criteria

- [ ] Mic button appears in every textarea in the scope list above.
- [ ] Recording → transcription → insert-at-cursor round trip works end-to-end with a real provider key.
- [ ] Groq and OpenAI both work via `[whisper]` config; the key comes from config or env.
- [ ] With no key configured the UI shows no mic (or a disabled one with a "set a whisper API key" tooltip) and never errors.
- [ ] The key never leaves the server; `repoos check` passes; UI smoke test still green.
- [ ] (Stretch, optional) Web Speech API fallback when no key is set.

## Notes for AI

- Reuse existing field styling (`ff-textarea`, `.pm-compose`, drawer styles) so the mic button visually matches each host.
- This is a UI + server feature with no task-file/format implications — do not touch the frontmatter schema or parser.
- Verify the UI with a browser probe after `bun run build`. Transcription itself needs a live provider key, so mock the `/api/transcribe` response to smoke-test the happy path headlessly.

## Activity

- 2026-08-13T17:57:26Z · created · unknown
- 2026-08-13T18:00:19Z · status draft→inbox
- 2026-08-13T18:00:25Z · status inbox→ready
- 2026-08-13T18:02:28Z · status ready→active, branch
- 2026-08-13T23:34:14Z · status active→ready
- 2026-08-14T00:21:46Z · body
- 2026-08-14T00:27:09Z · status ready→active
- 2026-08-14T00:35:42Z · status active→review

