---
id: "0247"
title: Hide mic/voice icons when no valid API key is configured
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/hide-mic-voice-icons-when-no-valid-api-k
model_override: default
pm_model_override: default
created_at: "2026-08-17T11:15:56Z"
updated_at: "2026-08-17T12:20:52Z"
---
## Problem

The UI shows microphone/voice icons that trigger Whisper-based voice input, but if the user hasn't configured a valid API key for the voice/Whisper service, clicking them will fail. Showing icons that can never work is confusing and leads to a broken experience.

## Desired UX

Mic/voice icons remain hidden across the entire UI when no valid voice/Whisper API key is present. When a valid key is configured, the icons appear as normal. No error toasts, no disabled states — just invisible until functional.

## Acceptance criteria

- [ ] Voice/mic icons are not rendered anywhere in the UI when no valid API key is configured
- [ ] Voice/mic icons appear normally when a valid API key is present
- [ ] The check is reactive — adding or removing a key in settings immediately shows or hides the icons without a page reload
- [ ] Existing voice input functionality is unaffected when a key is present

## Notes for AI

- This is a web UI concern (`src/ui-app/`).
- Look for how the existing settings/config stores the voice/Whisper API key — likely a reactive store or composable. Use that same source for the visibility check.
- Assume "valid" means non-empty and present in config. Don't implement server-side key validation unless the codebase already does so.
- Don't remove or hide the underlying voice input logic; only toggle the UI entry points (icons/buttons).
- If icons appear in multiple components (e.g., chat input, settings panel), hide them all consistently.

## Scope

In scope: all mic/voice icon visibility in the web UI.
Out of scope: voice input backend changes, API key validation beyond presence check, CLI or other non-web surfaces.

## Activity

- 2026-08-17T11:15:56Z · created · unknown
- 2026-08-17T11:16:45Z · status inbox→ready
- 2026-08-17T11:17:15Z · model_override
- 2026-08-17T12:20:15Z · pm_model_override
- 2026-08-17T12:20:52Z · status ready→active, branch
