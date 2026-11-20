---
task: "1263"
pass: 2
at: "2026-11-20T03:38:19.161Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-settings-general-agents-and-budg
state: ok
tree_identity: "2d3cea6d6:2d3cea6d65"
---
## Verdict
`needs some work` — the unnamed-control class is still present on the Agents page cards, Scheduled Tasks and the Remote Validation drawer; probe never walks those surfaces.

## Relevance
`still relevant` — the QA premise holds; the Settings-side fix is sound and pass 1's findings are all verified fixed.

## Evidence
None

## Bugs
- **Class: unnamed setting controls (missing accessible name)** — pass 1's instances are all fixed in this diff (boardColumnFields loop, `dev.failureSummary.ai`, ntfy topic, spend threshold, session duration, ServiceSettings, SettingsImportExport, Telegram test field, Auth add-user field, `storage.provider` trigger). But grepping the touched surface for the same pattern finds remaining instances the probe cannot see, because it never walks these routes/states:
  - `src/ui-app/src/components/AgentCard.vue` 82 and 84 — agent enable `Switch` beside a plain `<span>` name; no `aria-label`, no wrapping label (Agents default tab).
  - `src/ui-app/src/components/BuiltInAgentCard.vue` 321 — same pattern, built-in agent enable switch.
  - `src/ui-app/src/components/ScheduledTasksPanel.vue` 374 — per-schedule enable `Switch` (`data-testid` only) beside a plain span (Agents → Scheduled Tasks tab); the 567 instance is label-wrapped and fine.
  - `src/ui-app/src/components/RemoteValidationDrawer.vue` 356, 365, 474, 489 and the retryOtherHosts switch (~504) — five switches sit *next to* `<label>` elements that do not wrap them and have no `for`/`id` link, so none has a name (Settings Security → Configure runner drawer).
  Adding `:aria-label` from the adjacent label text at each site closes the class; widening the probe's `PAGES` to the default Agents tab and the other Agents tabs would have caught the first three mechanically.

No further findings of this class were found after grepping: AgentCard.vue, BuiltInAgentCard.vue, ScheduledTasksPanel.vue, RemoteValidationDrawer.vue, DevTargetDialog.vue (label-wrapped), ModelRoutingPanel.vue (label-wrapped), RemindersPanel.vue (`aria-labelledby`), TelegramChatNotificationsSettings.vue, SettingsImportExport.vue, ServiceSettings.vue, SettingsView.vue, BudgetControlsPanel.vue, and the new test file.

## Edge cases
- The probe's `named()` counts any non-empty `textContent` as a name — correct for buttons, but it would mask an icon-only `<button>` whose only content is a bare `<svg>` without `aria-label` (counted via the `svg[aria-label]` branch only).
- Budget Controls capture shows the panel but the active "Budget Controls" tab is scrolled out of the tab strip at capture width — the state is right, the highlighted tab isn't visible.
- The floating agent avatars overlap the Themes star icons and the "Floating agent buttons" switch in capture 1 — pre-existing, unchanged by this attribute-only diff.

## Suggestions
- Add the remaining Agents tabs (default, scheduled, reminders, detected, providers, model-routing) to the probe's `PAGES` so the class is enforced, not just fixed once.
- RemoteValidationDrawer: wrap each switch in its label or add `aria-label`; the prose-heavy labels make `aria-label` summarisation worthwhile.

## Could not verify (environment)
None

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T03:35:53.639Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

