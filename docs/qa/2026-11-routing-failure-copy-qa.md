# Routing failure copy QA: missing key, provider failure and recent decisions — November 2026

Task #1243. After model routing moved to TypeSafe Jev, the Agents page routing
tab needed a check of the missing-key and provider-failure wording, and of the
recent-decisions list in its empty and all-failure states. This pass follows the
layout audit in `2026-11-agents-routing-qa.md` (#1223) and looks at the words,
not the geometry.

## Scope and method

- Headless WebKit Playwright against fixtures only. No visible browser was
  opened, and no real API key was read, printed or used.
- The copy was traced from the server to the screen: `modelRoutingStatus` and
  `probeModelRouting` (`src/core/model-routing/runtime.ts`), the policy's
  blocked-decision message (`src/core/model-routing/policy.ts`), the provider
  errors (`src/core/model-routing/providers.ts`), and the panel's fallback and
  empty-state text (`src/ui-app/src/components/ModelRoutingPanel.vue`).
- States checked: a missing Jev key (issue notice, "Not set" pill, "Not ready"
  state, masked key form), a live-probe provider failure (failed card with reason
  and hint), a decision list that is all provider-failure fallbacks, an empty
  list, and a decisions request that fails to load. The WebKit render cases use
  `src/ui-app/tests/agents-page-qa-browser.test.ts` at 375, 768 and 1280 px.

## Findings and disposition

| Finding | Evidence | Disposition |
| --- | --- | --- |
| A failed decisions request showed "Nothing recorded yet." | `refreshDecisions` caught every error and set the list to `[]`, so an outage read as an empty history. | Fixed. A failed load now shows "Recent decisions could not be loaded. That is not the same as no decisions yet." with a Try again button (`routing-decisions-error`, `routing-decisions-retry`). A successful empty load keeps the original empty copy. Covered in `model-routing-panel.test.ts` (failure, retry, and the real empty state) and in WebKit at all three widths. |
| A blocked decision exposed an internal reason code | The policy message read "Model routing could not decide (provider-failure) …", which put a slug into a user-facing note. | Fixed. The message now reads "Model routing could not pick a model because the decision model could not be reached, and the configured fallback is not eligible." The cause is mapped from the reason, and the next step is kept. Covered in `model-routing.test.ts`, which also asserts that no slug appears. |
| The missing-key WebKit fixture used wording the server never returns | The fixture said "No TypeSafe Jev API key is saved yet — paste one below", but `modelRoutingStatus` returns "Save your TypeSafe Jev API key below (stored in .env only)." The render test was checking copy users would not see. | Fixed. The fixture and its assertion now use the server's exact wording. |

## Checked with no defect found

- **Missing key.** The notice names the next step ("Save your TypeSafe Jev API
  key below"), and the "Not set" and "Not ready" pills agree with it. The live
  card's "not configured" hint says "above", which is correct: the key form sits
  above the probe buttons and the live card.
- **Provider failure.** The live card says "Failed" and gives the provider's
  reason. Its hint points to the Model providers tab. Fallback decisions read as
  normal behaviour ("The decision model could not be reached, so the role default
  was used."), in the muted fallback pill rather than an error style.
- **All-failure list.** A list made only of provider-failure fallbacks renders
  each row with the plain fallback sentence and the fallback pill, and no error
  banner or empty copy (jsdom test "reads a list of only provider failures…").
- **Keys stay masked.** The Jev key field is a `password` input with a placeholder
  that names where the key is stored. The only credential surfaces are the
  Saved / Not set / Not needed pills and boolean flags. The server's provider
  errors contain no key values; the one message that names an env var
  (`TYPESAFE_API_KEY`, in `providers.ts`) is only built when a provider was
  constructed without a key, and the probe path returns the missing-key notice
  before it can reach the screen.

## Not verified

- Live provider behaviour with real keys. This pass used fixtures only, by design.
- The Model providers tab's own copy beyond the routing tab's cross-references.
- Light theme, real devices and touch input.
- The decisions list at more than ten entries. The panel requests `limit=10`.
