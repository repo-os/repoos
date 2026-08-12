---
id: "0135"
title: Add ntfy test notification button
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/add-ntfy-test-notification-button
---

## Problem

After configuring an ntfy topic, there is no way to verify that notifications actually work without triggering a real task lifecycle event. Users need a quick, low-stakes way to confirm their topic is correct and the ntfy delivery path is functional.

## Desired UX

- In the Settings page, on the ntfy Notifications card, a "Send test" button appears next to (or directly below) the topic input field.
- The button is visually disabled (grayed out) when the topic field is empty. It becomes clickable once a topic is typed.
- Clicking the button fires a one-off test notification to the configured topic with the message `Hello from RepoOS at <repo_name>!`, where `<repo_name>` is the directory name of the current repo (e.g. `myproject`).
- On success, the button briefly changes to a checkmark or shows a small confirmation label (e.g. "Sent!"). On failure, it shows "Failed" briefly and reverts — no persistent error blocking.
- The test notification respects the ntfy enable toggle: if ntfy is toggled off, the button should still be disabled (or hidden) regardless of whether a topic is set.

## Acceptance criteria

- [ ] A "Send test" button renders inside the ntfy Notifications card, adjacent to the topic input.
- [ ] The button is disabled when `ntfyTopic` is empty or `ntfyEnabled` is false.
- [ ] Clicking the button POSTs to a new `/api/ntfy/test` endpoint, which reads the current config and publishes a message of the form `Hello from RepoOS at <repo_name>!`.
- [ ] The endpoint is fire-and-forget (returns 200 immediately after dispatching the fetch; does not wait for the ntfy server response).
- [ ] The UI shows a brief success/failure visual state on the button after clicking (no global toast needed — an inline label or icon swap is sufficient).
- [ ] The test notification uses the same base URL resolution as regular ntfy notifications (config key, then `NTFY_BASE_URL` env var, then default `https://ntfy.sh`).
- [ ] No new runtime dependencies.

## Notes for AI

- Add the API endpoint in `src/server/server.ts` as `POST /api/ntfy/test`. It should:
  - Read the current config.
  - Gate on `ntfyEnabled` and non-empty `ntfyTopic`; if either is missing, return 400 with a descriptive error.
  - Resolve the repo name the same way the dashboard does — from the health endpoint's root path, splitting on `/` and taking the last segment.
  - Call the existing `publish()` from `src/server/ntfy.ts` with the test message.
  - Return 200 immediately (do not await the ntfy server response).
- The repo name for the message is already computed as `repo.repoName` in the Vue store (`src/ui-app/src/stores/repo.ts:148`). You can either pass it from the client in the POST body, or resolve it server-side from the working directory. Server-side resolution is simpler (no client trust issue) and keeps the API self-contained.
- The button should live in `src/ui-app/src/views/SettingsView.vue`, next to the topic input (`#setting-ntfyTopic`). The repo store is already used elsewhere in the app; import `useRepoStore` to get `repoName`.
- Follow existing UI patterns: the `Button` component from `src/ui-app/src/components/ui/` is already used in this view. Use `disabled` prop to gray it out when conditions aren't met.
- Success/failure state: use a local `ref` (e.g. `testState: "idle" | "sending" | "sent" | "failed"`) and show the label on the button or next to it. Auto-reset to `"idle"` after ~2 seconds.
- The test message string: `"Hello from RepoOS at <repo_name>!"` — use the actual repo directory name, not the literal `<repo_name>` placeholder.
- Do NOT add any new config keys. This is a UI + API-only change.
- Files likely to touch:
  - `src/server/server.ts` — new route
  - `src/ui-app/src/views/SettingsView.vue` — button + state
  - `src/server/ntfy.ts` — may need no changes (reuse `publish` and `shouldSend`)

## Scope

In scope:
- Button in the Settings ntfy card to send a test notification
- `POST /api/ntfy/test` endpoint
- Inline success/failure feedback on the button
- Reuses existing ntfy publish path with same base URL resolution

Deferred / out of scope:
- Notification delivery guarantee (remains best-effort, fire-and-forget)
- Persistent notification history or delivery log
- Client-side ntfy topic validation beyond non-empty check
