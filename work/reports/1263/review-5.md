---
task: "1263"
pass: 5
at: "2026-11-20T13:23:34.527Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-settings-general-agents-and-budg
state: ok
tree_identity: "e935ce52d:e935ce52d1"
---
## Verdict
`good to go` — the diff closes every prior review finding and both declared captures are current and show real rendered content.

## Relevance
`still relevant` — the Settings/Agents/Budget QA premise holds; this round lands the 1280px tab-strip wrap fix the gate failed on and the evidence now backs it.

## Evidence
None

## Bugs

None found

Verified against earlier passes: pass 1–2 unnamed-control instances (AgentCard/BuiltInAgentCard/ScheduledTasksPanel switches, all five RemoteValidationDrawer switches, Auth add-user field, Telegram test field, ServiceSettings, SettingsImportExport, `storage.provider` trigger, SettingsView config loops) are all present in the diff with `aria-label`/`:aria-label`; pass 2's suggestion to widen the probe's `PAGES` was done (all 14 Settings/Agents routes at 375/768/1280); pass 4's stale/loading captures are replaced — `default-1.png` and `default-2.png` now render real named controls with zero console errors, captured on tree `e935ce52d`, and only docs/bookkeeping commits (`c4cc636`, `d89f1de`) precede reviewed HEAD `d89f1de`, so the evidence is current. The CSS wrap change is confined to `.agent-tabs`; the remaining `overflow-x: auto` + hidden-scrollbar strip (`.drawer-tabs-scroll`, opt-in modifier per #0502) is a deliberate sibling contract, not this class, and the `.agents-page > .agent-tabs` rule doesn't reintroduce overflow. The rewritten `mobile-touch-affordances` regexes match the new base rule and correctly forbid `overflow-x: auto`; this is a declared contract change, not test weakening. No bare `node`/`npm`/`npx` invocations; the new test uses `node:fs` imports and existing `ui-harness`/`ui-smoke` infra.

No further findings of this class were found after grepping: style.css (all `.agent-tabs`, `.tab-btn`, `.drawer-tabs-scroll`, media-query rules), ChecksView.vue, AgentsView.vue, TaskDrawer.vue, StoryPanel.vue, AgentCard.vue, BuiltInAgentCard.vue, ScheduledTasksPanel.vue, RemoteValidationDrawer.vue, ServiceSettings.vue, SettingsImportExport.vue, TelegramSettingsPanel.vue, AuthSettingsPanel.vue, SettingsView.vue, mobile-touch-affordances.test.ts, and the new QA test file.

## Edge cases
- `describe.skip` when Playwright is unavailable matches existing sibling tests (convention, not a defect); the vacuous-pass guard (`focus.visited > 0`) mitigates the main risk.
- Wrapping grows the Checks page tab strip height at narrow widths — consistent with Agents, cosmetic.
- The probe's `named()` still counts any non-empty `textContent` as a name; focus audit proves change, not contrast (carried, non-blocking).

## Suggestions (non-blocking)
- The probe's named-control check would still miss an icon-only `<button>` whose only content is an unlabelled bare `<svg>`; tightening that branch would close the last audit blind spot.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T07:24:53.566Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

