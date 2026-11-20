---
task: "1249"
pass: 1
at: "2026-11-19T22:34:08.317Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-telegram-and-notification-settin
state: ok
tree_identity: "24b2e3ebd:3f7dc43ddb"
---
## Verdict
`needs some work` — the QA fixes themselves are sound, but two classes the engineer fixed here still have unfixed sibling instances.

## Relevance
`still relevant` — the spec's screens and messages are exactly what changed, and no later work supersedes this pass.

## Evidence
None

## Bugs
- **Class: JSON_OPTS-spread-not-called** — the diff fixes one instance (`TelegramChatNotificationsSettings.vue` now calls `JSON_OPTS("PATCH", …)`) but three sibling instances remain: `src/ui-app/src/stores/reminders.ts:94` (`mutate()` spreads `...JSON_OPTS`, so every reminder POST/PATCH goes out with no `Content-Type: application/json` — works only because the server reads the body regardless, the exact "by accident" behavior the engineer documented), and `src/ui-app/src/components/TaskDrawer.vue:4401` and `src/ui-app/src/components/AuthSettingsPanel.vue:261` (both `{ method: "POST", ...JSON_OPTS }`, which spreads the function to nothing: no headers, no body).
- **Class: native-confirm-for-app-actions** — the diff converts the Telegram panel's two dialogs to the shared `ConfirmDialog`, but `src/ui-app/src/views/SettingsView.vue:466` (a file this diff edits) still calls `window.confirm` before discarding unsaved `repoos.toml` edits, and the sweep found the same pattern in `ServiceSettings.vue:124`, `TaskCard.vue:938`, `SystemResourcePanel.vue:117` and `TaskDrawer.vue:2176`.

No further findings of this class were found after grepping: src/ui-app/src for `...JSON_OPTS` and `JSON_OPTS(` spreads, `confirm(`/`window.confirm`/`alert(`/`prompt(` across all `.vue`/`.ts`, plus the diff's modified components, tests and docs.

## Edge cases
- `transportLabel` looks up a `Record`; an unexpected transport mode from the server renders `undefined` as a bare "· " with no label — needs a fallback.
- `toggleError` is not cleared when `telegram.enabled` flips off, so a stale toggle error can outlive the rows it names.
- `chatType` still renders raw ("supergroup") in the chat row description; the QA doc doesn't record it.
- The browser test's `not.toContain("transport")` is brittle against future copy that legitimately uses the word.

## Suggestions
- The declared shot's label promises "the test-result line", but no `steps`/`state` were declared, so the capture (clean, current, correct target) cannot show it — either re-declare with a Send-test step or reword the label.
- Native-confirm and JSON_OPTS siblings outside this diff may warrant an Easter-eggs bundle instead of expanding this task.

Note: no earlier review passes exist (only the round-1 engineering report), so there were no prior findings to re-verify.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T22:31:55.925Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

