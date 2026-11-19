# Notification and Telegram settings — November 2026 QA pass (#1249)

## Scope and method

This pass covered Settings → Notifications: the ntfy section, the Telegram bot section (connect, status, test message, bound chats), the per-chat task notification toggles, and the messages those screens show. It checked wording, error states and layout at 375, 768 and 1280 px.

Browser checks ran headless WebKit against the built app, served in-process with auth disabled. Playwright answered every `/api/telegram/**`, `/api/auth/telegram/**` and `/api/ntfy/**` request from fixtures, and turned the Telegram and ntfy switches on in a fetched `/api/config`. Placeholder values only: the fake token is shaped like a bot token but is not one, and nothing was sent to Telegram or ntfy. Any request to `api.telegram.org` is aborted and recorded. No visible browser was opened.

The test file is `src/ui-app/tests/notifications-settings-qa-browser.test.ts`. Component tests are in `telegram-settings-panel.test.ts` and `telegram-chat-notifications-settings.test.ts`.

## Findings and dispositions

| Finding | Impact | Disposition |
| --- | --- | --- |
| Unbind and disconnect used native `confirm()`. | AGENTS.md bans native dialogs for app actions. The prompt also read as a browser message, not RepoOS. | Both now use the shared `ConfirmDialog`. The dialog names the account being unbound. Cancel sends nothing. |
| The bound-chat list showed "No Telegram chats are bound yet" when the load failed. | A server or network failure looked like an empty list, so the user had no reason to retry. | A failed load shows "Couldn't load your Telegram chats. Check the connection, then try again." The empty state shows only for a real empty list. |
| The empty state told the user to bind chats "from the admin API". | There is no UI control for bind codes, so the user had no next step. | The empty state now says to send `/bind` followed by a bind code from an administrator, and says plainly that bind codes are created through the API for now. |
| A failed chat-notification toggle was an unhandled rejection with no message. | The switch showed no result, and the user could not tell whether the change saved. | A failed toggle names the chat and says "Try again." |
| The chat-notification PATCH spread `JSON_OPTS` (a function) instead of calling it. | The request went out without `Content-Type: application/json`. The server currently reads the body anyway, so the toggle worked by accident. | The call now uses `JSON_OPTS("PATCH", …)`. A unit test pins the header and body. |
| The status line showed raw enums: "transport off" and "transport polling". | Jargon with no meaning to a user. | Plain English: "not receiving messages", "checking Telegram for messages", or "receiving messages by webhook". |
| Several failure fallbacks read "Failed to …" with no next step. | Connect, provisioning, test message and unbind failures gave no direction. | Each fallback says what failed and what to check, for example "Couldn't send the test message. Check that the bot is still in that chat, then try again." |
| The ntfy test showed only "✗ Failed" on the button, reverting after two seconds. | No reason and no next step. The disabled button also gave no explanation. | A result line sits under the topic row and stays until the next attempt. A disabled test shows "Turn on ntfy and enter a topic to send a test." |
| The disabled-integration API error said "set [telegram] enabled = true in repoos.toml". | A settings user cannot act on a TOML key from this screen. | Now: "Telegram is off for this repository. Turn on the Telegram bot in Settings → Notifications, then try again." Three route-test assertions moved to the new wording. |
| Chat rows showed Telegram's raw chat type ("supergroup"). | Jargon on the notifications screen. | Plain labels: "Private chat", "Group", "Channel", and "Chat" for anything unknown. |
| A stale toggle error stayed on screen after the Telegram switch was turned off. | The message named chat rows that were no longer shown. | The error clears when the feature goes off. |
| An unrecognised receive mode rendered as a bare "· " in the status line. | A dangling separator with no meaning. | Unknown modes read "receive status unknown". |
| Review round 1: the same `...JSON_OPTS` spread bug sat in three sibling call sites (reminders store, AuthSettingsPanel disconnect, TaskDrawer split). | Reminder writes and other bodyless POSTs went out without JSON headers. | Every spread now calls `JSON_OPTS(method, body)` (or `JSON_OPTS("POST", {})` for bodyless POSTs). The helper accepts `DELETE` so the reminders store can use it for every method. |
| Review round 1: five more native `confirm()` calls: removing the background service, cancelling a stalled check, killing a process, reopening a done task, and discarding unsaved `repoos.toml` edits. | Each was a native browser prompt for an app action, which AGENTS.md bans. | Each now opens the shared `ConfirmDialog` with a named action. Cancelling leaves the state unchanged. |

## Layout and security checks

At 375, 768 and 1280 px the tab has no horizontal page overflow in the disconnected, connected, chat-error and ntfy-error states, as measured by the browser test. The connect cards stack below 720 px. Visual fit of the test-message row was not inspected by eye; the overflow measurement is the only evidence for it.

Bot-token check: a token typed into the BYO field and accepted by the server is not in the rendered text or HTML (checked with `innerText` and `innerHTML`).

## Not changed, and why

- Bind codes have no UI control. Adding one is a new feature, so it is a follow-up task. The empty state says so.
- `TelegramSettingsPanel` still shows `status.lastError` raw under "Last error:". The text comes from the Telegram adapter, which already redacts tokens. Rewording it needs a per-error mapping, which is out of scope here.
- `provider.ts` still has an internal "polling is paused while the Telegram integration is disabled" reason. It is not in the Settings screen's path, so it was left alone.
- Human checks remain. A real Telegram bot, a real phone with the ntfy app, and a visible-browser pass were not done, because the task forbids real tokens and contact with Telegram. A human should confirm the ntfy test arrives on a device.

## Verification

- `bun run test -- src/ui-app/tests/telegram-settings-panel.test.ts src/ui-app/tests/telegram-chat-notifications-settings.test.ts src/ui-app/tests/telegram-routes.test.ts` — the component and route tests pass. The chat-notification file adds four state and PATCH tests; the panel file adds disconnect and dialog tests.
- `bun run test -- src/ui-app/tests/notifications-settings-qa-browser.test.ts` — 13 of 13 pass: four cases at each of 375, 768 and 1280 px, plus the setup check. Zero page exceptions, zero native dialogs, no horizontal overflow.
- `bun run test -- src/ui-app/tests/telegram-settings-panel.test.ts src/ui-app/tests/telegram-chat-notifications-settings.test.ts src/ui-app/tests/telegram-routes.test.ts` — 12 panel tests and 7 chat-notification tests pass, plus the route tests.
- `bun run test -- src/ui-app/tests/native-dialog-json-opts-guard.test.ts` — 11 of 11 pass. The guard scans every `.vue` and `.ts` file under `src/ui-app/src` for a `...JSON_OPTS` spread and for a native `confirm()`, and it proves the scanner catches the bad forms.
- `bun run test -- src/ui-app/tests/notifications-settings-qa-browser.test.ts src/ui-app/tests/sign-in-users-qa-browser.test.ts` — 56 of 56 pass across the two files. The notifications file covers 13 cases at 375, 768 and 1280 px. The sign-in file covers the AuthSettingsPanel disconnect that now uses the corrected helper.
- Touched-component suites (reminders, system resources, task transitions, Telegram disconnect, reload, raw config store, merge guard) — all pass.
- `bun run build:ui` — passes, including `vue-tsc`.
- `REPOOS_CHECK_CHANGED=main repoos check` — see the task's final report for the result.

Per-dialog behaviour tests for the five new confirms were not added. The guard test proves that no native confirm remains, and the existing suites for those components still pass.
