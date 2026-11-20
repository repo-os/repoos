---
task: "1263"
pass: 1
at: "2026-11-20T03:09:22.561Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-settings-general-agents-and-budg
state: ok
tree_identity: "7b1227c01:d264ce4068"
---
## Verdict
`needs some work` — the General/Agents/Budget walked surfaces are clean, but the accessible-name fix is incomplete across its own class.

## Relevance
`still relevant` — the QA premise holds; the aria-label work is sound as far as it goes.

## Evidence
None

## Bugs
- **Class: unnamed setting controls (missing accessible name)** — the diff adds `aria-label`/`:aria-label` to the config-driven rows and most hand-written switches, but several sibling instances of the exact same pattern were left unnamed (`setting-label` is a plain `div`, so the control has no name):
  - `src/ui-app/src/views/SettingsView.vue` ~2606 — `boardColumnFields` loop `Input`s (Advanced tab): the sibling `advancedGuardedFields` loop (~2518–2567) got `:aria-label="f.label"`, this loop did not.
  - `SettingsView.vue` ~2641 — "Explain dev failures with AI" `Switch` (`dev.failureSummary.ai`, Advanced tab): no label.
  - `SettingsView.vue` ~2152 — ntfy topic `Input` (Notifications tab): the ntfy switch got a label, the topic field next to it did not.
  - `SettingsView.vue` ~2251 — spend alert threshold `Input` (Notifications tab): no label.
  - `SettingsView.vue` ~2417 — session duration `Input` (Security tab): no label.
  - `src/ui-app/src/components/ServiceSettings.vue` ~281 — auto-start `Switch`: no label.
  - `src/ui-app/src/components/SettingsImportExport.vue` ~279 — per-section export `Switch`es: no label.
  These are outside the three walked tabs, but the implementer chose to fix the class there (named the Notifications/Security switches), so the remaining instances are incomplete class coverage; each fails the same probe assertion if that tab is walked.

No further findings of this class were found after grepping: SettingsView.vue (all Switch/Input/SelectTrigger sites), ServiceSettings.vue, TelegramChatNotificationsSettings.vue (already labelled), SettingsImportExport.vue, BudgetControlsPanel.vue (label-wrapped), AgentsView.vue, DevTargetsSettings, and the new test file.

## Edge cases
- `SelectTrigger` for `storage.provider` (~1905) has no explicit label and relies on `SelectValue` text; it is unnamed whenever the stored value is empty/unknown.
- The probe's focus audit checks that focus *changes* something, not that the change is visible enough — the engineer's own note that border-colour focus rings were not contrast-measured stands.
- If `startPreviewServer` fails with a non-Playwright error, `bootErrors` is recorded but every test is skipped, so a broken harness boots silently green (matches existing sibling tests, so convention, not a new defect).

## Suggestions
- The single auto capture is the dashboard root, not `/settings?tab=general` or `/agents?tab=budget-controls`; since the diff is attribute-only this is acceptable, but declaring one shot per walked route would make future evidence direct.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T03:05:46.548Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

