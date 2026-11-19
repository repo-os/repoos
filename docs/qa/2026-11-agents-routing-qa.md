# Agents page QA pass: agent list, Model providers and Model routing — November 2026

Task #1223. The Agents page had not been QA-checked since the routing provider
changed to Jev (#0809), including the missing-API-key state. This pass covers
the default agent list, the Model providers tab and the Model routing tab at
375, 768 and 1280 CSS pixels.

## Scope and method

- Headless WebKit Playwright against fixtures only; no visible browser was
  opened and no real API key was read, printed or used anywhere in the pass.
- The harness mounts the real components (`AgentsView`, `ModelProvidersPanel`,
  `ModelRoutingPanel`) in jsdom with fixture data, extracts the rendered
  markup plus the compiled scoped styles, and renders it in headless WebKit
  with the real built global stylesheet inside a minimal app shell
  (`.app-shell > .body > .sidebar + .main`). The same approach as
  `task-create-edit-browser.test.ts`.
- Per fixture and width, the audit records the document's horizontal
  scroll width and every visible element whose box extends past the viewport.
  Content inside a horizontal scroller (a valid pattern) and content of a
  *closed* `<details>` (laid out by the engine but never painted — it
  false-positived on the agent run details until the open state was covered
  explicitly) are excluded on purpose.
- States checked: the agent list with a failed and a previous-setup run (with
  both run details expanded), Model providers with a missing key (OpenRouter,
  TypeSafe Jev), a healthy keyed row (opencode Go), a CLI-login row with an
  unavailable session (Muse), a failed usage fetch (DeepInfra), a link-only
  row (Cursor), and Model routing in the missing-key state (key form opened)
  and in the provider-failure state (failed live-probe card plus four recent
  decisions, one expanded).
- Twelve WebKit render checks (4 fixtures × 3 widths) live in
  `src/ui-app/tests/agents-page-qa-browser.test.ts`. They skip cleanly when
  Playwright/WebKit is not installed. Set `QA_SHOTS=<dir>` to save a
  full-page screenshot per fixture and width.
- Screenshots were inspected for every fixture and width, in addition to the
  geometry assertions.

## Findings and disposition

| Finding | Evidence | Disposition |
| --- | --- | --- |
| The agent card's on/off switch lost its pill shape on phones | At 375px the switch rendered as a 44px circle with the 16px thumb at the far left edge; the 40×22 on/off track was gone. The 44px touch-target rule from #1139 (`.agents-page button { min-width/min-height: 44px }`) also hits the switch root, whose `rounded-full` turns a 44×44 box into a circle. | Fixed: below 720px the switch keeps its 44px hit area while the 40×22 track is drawn inside it (`::before`), and the thumb is positioned inside the track. The checked override had to retarget Tailwind's `--tw-translate-x` custom property: the CSS minifier downlevels the separate `translate` shorthand away, and a `transform` override would *add* to Tailwind v4's own `translate` property instead of replacing it. Geometry asserted at all three widths (`src/ui-app/src/style.css`). |
| Model providers claimed "No usage reported yet." under real usage data | The opencode Go row showed both rolling windows *and* the amber "No usage reported yet." line at 375, 768 and 1280px. The `v-else` fallback for that text fired whenever no availability message and no "unrecognized" flag were present — including rows whose windows rendered above it. | Fixed: the fallback now renders only when the row has no usage windows (`src/ui-app/src/components/ModelProvidersPanel.vue`). Regression-asserted on the opencode Go row. |
| Model routing: the "Before a task starts" heading ran into the first checkbox | At 1280px the heading and the "Check for mixed AI and human steps…" chip sat on one line; `.field-label` has no global rule, so the bare span flowed inline beside the chip. | Fixed: the panel's section labels are block-level (`ModelRoutingPanel.vue`), asserted for the human-step section. |
| Model routing: the four config fields placed labels inconsistently | "Mode", "Decision provider" and "Model id" stacked their label above the control only because the controls are full-width; the 140px timeout input shared its label's line at every width. | Fixed: all four `.mr-grid` field labels stack above their controls, asserted for all four fields. |
| Model routing: the pasted-key placeholder truncated mid-word on phones | At 375px the open key form showed "Paste API key — stored in.en" squeezed beside the Save button. | Fixed: below 480px the key input takes a whole row and the buttons wrap below (`ModelRoutingPanel.vue`); asserted at 375px. |
| Model routing: the failed live-probe card's "Show details" toggle wrapped onto two lines at 375px | The card head is a tight flex row; the toggle wrapped. | Fixed: the toggle no longer wraps (`white-space: nowrap`). |

## Checked with no defect found

- Full audit: no document horizontal overflow and no off-viewport control in
  any of the four fixtures at 375, 768 and 1280px, after the fixes.
- Masking held everywhere: provider key fields and the routing key field are
  `type="password"` with realistic placeholders, and the only credential
  surfaces are the Saved / Not set / Not needed pills and boolean `hasKey`
  flags. No key value exists anywhere in the fixtures.
- Provider-failure states explain themselves in plain English and offer a
  Retry: DeepInfra's failed fetch, Muse's signed-out message, and the
  routing tab's failed live call ("TypeSafe Jev did not answer within 8000
  ms." plus the pointer to the Model providers tab).
- Recent decisions read as normal behaviour, not errors: the
  provider-failure fallback says "The decision model could not be reached,
  so the role default was used.", the blocked decision names the
  budget-allowlist reason, and shadow/automatic/applied pills distinguish
  the modes. The expanded decision (question sent / answer received with
  probabilities) fits at 375px.
- The missing-key state on Model routing is actionable: a "Not set" pill,
  "Not ready" provider state, a plain-English issue notice, and the masked
  paste form one click away.
- The empty recent-decisions state explains when records will appear.
- The agent tab strip wraps to two rows at 375 and 768 (the #1139 behaviour
  still holds).

## Not verified

- Live provider behaviour with real API keys — by design; the pass used
  fixtures only and never touched real keys.
- The Model playground, Budget controls, Scheduled tasks, Reminders and
  Detected coding agents tabs — outside this task's scope.
- Light theme, real devices and touch input. The fixture shell omits the
  top bar and mobile tab bar; the content area under them is what was audited.
- The `Select` value text renders empty in the jsdom fixture (Radix looks up
  the selected label from mounted options, which a closed select does not
  mount), so the closed-trigger label fitting was verified by earlier QA
  passes rather than this one; the trigger geometry was audited here.
