# Labels, tooltips and empty-label audit QA

Date: 2026-11-20 · Task #1250

## Scope and method

This pass scanned the Vue templates under `src/ui-app/src` for three things: native `title` attributes, icon-only buttons and links without an accessible name, and the same action worded differently in different places. No visible browser was opened; the checks are static template scans plus the scoped test run.

Two scans were run. The first looked for `<button>` and `<a>` elements with no visible text and no `aria-label`, `aria-labelledby`, `title` or `v-bind` (dynamic) attributes. It found none. The second looked for icon-only controls whose only name was a `title`. It found eight, of which three were `FloatingHeads` head buttons whose `<img alt>` already supplies a name. The scans are heuristic: they do not evaluate computed names, and a control built from a child component with its own name (for example an `<IconButton>` wrapper) can slip past them.

## macOS Hub

The task title also covers the macOS Hub, but the scans above only read the web UI. The Hub was checked by reading its Swift sources, not by running it. `macos/RepoOSHub/HubSidebarControls.swift` gives each icon-only control an `accessibilityLabel` and a `.help()` string, and `ServerSidebarView.swift`, `ServerEditorSheet.swift` and `HubSettingsView.swift` name their other icon controls the same way. Nothing looked unlabelled.

The web rule against native `title` tooltips does not carry over to the Hub. `.help()` is the native macOS tooltip for a native app, so it is the correct tool there and was left unchanged.

## Native title attributes

Roughly 100 `title` attributes remain in the app. They are not browser bubbles in practice. `src/ui-app/src/lib/tooltip.ts` installs one delegated, body-level tooltip that restyles any `title` (or `data-tip`) into a popup, so these are styled tooltips that use the banned attribute as their source. Replacing them all with a per-component tooltip is a large, separate refactor and was not attempted here. The convention rule (no new native `title` tooltips in new UI, see `docs/agent-ui-and-preview-conventions.md`) still applies to new code.

## Defect found: title-only names are lost after interaction

`installTooltips()` strips the `title` from an element on the first `mouseover` or `focusin` and moves its text to `data-tip`. A button that named itself only with `title` therefore had no accessible name after the first hover or keyboard focus. This is a real defect for every icon-only control in that state.

The fix is to give each such control its own `aria-label`, keeping `title` for the tooltip. Changed controls:

- `IntegrationStatusBar.vue`: the pipeline collapse toggle.
- `AgentCard.vue`: the instructions expand and collapse toggle (the label follows its state).
- `AgentModelModal.vue`: both favorite star buttons ("Add to favorites" and "Remove from favorites").
- `DiffView.vue`: the previous-file and next-file arrows.

A wider fix in `tooltip.ts` (copying `title` into `aria-label` when a control has no visible text) was considered and rejected for now. It would also change the name of controls that have visible text, and that needs its own review.

## Inconsistent wording

- Full-screen diff: `TaskDrawer.vue` said "Open the full-screen diff view" while `DiffFileViewer.vue` and the other diff controls say "Open full-screen diff". The drawer control now uses the shared wording.

Observed but not changed, because each needs a product decision on the verb rather than a mechanical fix:

- Removing items: "Remove attachment", "Remove screenshot", "Delete schedule", "Delete reminder?" and "Kill this process" use three verbs for similar actions.
- Dismissing items: "Dismiss this error", "Dismiss notification" and "Acknowledge this task is done" describe the same kind of close action differently.
- Chat stop and close: "Stop response" and "Close" are used consistently across the chat panels, so no change is needed there.

## Tests

`src/ui-app/tests/icon-control-names.test.ts` is the ratchet. It fails if any button or link in `src/ui-app/src` has no visible text and no name attribute (or non-empty `<img alt>`). The open-tag match is quote-aware, so a `>` inside an attribute value such as `:disabled="i > 0"` cannot hide a control. Bound attributes (`v-bind`) do not exempt a control, so an unnamed control with a spread of attributes is still flagged. It also pins the `aria-label` values of the controls fixed here and the shared full-screen diff wording. Fixture cases check that the scan flags a title-only icon button, a `>` inside an attribute, a `v-bind` control with no name, and an empty `alt`, and accepts the same markup once it is named.

Existing suites that cover these components still pass: `favorites`, `agent-model-memory`, `integration-status-bar`, `task-drawer-dirty-diff-button`, `diff-view-escape` and `diff-view-syntax`.

## Not verified

No headless or visual check was run for this pass. The changes add attributes and one wording change, so no layout or styling changes were expected. A human screen-reader check of the four fixed controls has not been done and should not be treated as proven by the tests.

## Follow-ups

- Decide one verb per action family (remove/delete, dismiss/close) and apply it in a single bundled task.
- Consider moving the title-to-`aria-label` fallback into `tooltip.ts`, with a test that controls with visible text keep their visible name.
- Retire native `title` use over time by moving explanations to the shared tooltip directly.
