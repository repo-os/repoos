---
id: "1236"
title: "Easter eggs bundle: bound LoginView auth fetches (slow-server login spinner)"
type: bug
status: active
paths: [src/ui-app/src/views/LoginView.vue]
priority: p3
area: web
depends_on: ["1226"]
assigned_to: ai
created_by: t@t
branch: feat/easter-eggs-bundle-bound-loginview-auth-
created_at: "2026-11-19T16:18:14Z"
updated_at: "2026-11-19T16:59:35Z"
---
## Problem
QA pass #1226 bounded the boot-gating fetches in the web app, but `LoginView.checkStatus` still issues its own unbounded `fetch("/api/auth/status")` and `/api/auth/me` with no `AbortSignal` — a stalled connection leaves the login page's spinner up until the browser's default timeout, the same unbounded-fetch class the pass fixed elsewhere.

## Desired UX
When the server is slow or unreachable, the login page shows a plain-English status (never an endless spinner), recovers on its own, and stays usable at 375, 768 and 1280 px.

## Acceptance criteria
- `checkStatus` fetches are bounded with the same pattern as the boot path (timeout + plain-English failure state).
- Headless Playwright only, against fixtures and request interception; never a visible browser or stolen focus.
- Fix verified with tests under slow/500/offline responses.

## Notes for AI
- The #1226 QA doc (`docs/qa/2026-11-offline-slow-network-qa.md`) explicitly declared login screens out of scope; review passes 1 and 2 both recommended this follow-up.
- Do not touch repoos.toml.

## Activity

- 2026-11-19T16:18:14Z · created · t@t
- 2026-11-19T16:18:15Z · needs_input
- 2026-11-19T16:18:24Z · body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-11-19T16:18:24Z · needs_input
- 2026-11-19T16:24:11Z · title
- 2026-11-19T16:47:31Z · status inbox→ready
- 2026-11-19T16:47:33Z · status ready→active, branch
- 2026-11-19T16:47:33Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T16:59:35Z · message_queued at 2026-11-19T16:59:35.826Z
