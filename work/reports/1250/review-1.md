---
task: "1250"
pass: 1
at: "2026-11-19T22:01:08.827Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-hub-macos-and-web-shared-strings
state: ok
tree_identity: "003d84546:46e6d8130d"
---
## Verdict
`needs some work` — the guard test's scan silently skips buttons whose attribute values contain `>`, weakening the ratchet this task ships.

## Relevance
`still relevant` — the tooltip title-stripping defect is real (verified in `tooltip.ts` `textFor()`), the audit is committed, and nothing on main supersedes it.

## Evidence
None

## Bugs
- **Class: guard scan false negatives** — `src/ui-app/tests/icon-control-names.test.ts`: the scan regex `<(button|a)\b([^>]*)>` stops at the first `>`, so an icon-only button whose attribute value contains `>` (e.g. `:disabled="i > 0"`, `:title="a > b ? 'x' : 'y'"`) is mis-parsed: the leftover attribute text counts as "visible text" and the unnamed control is silently exempt. `views/LoginView.vue:413` proves the pattern exists in real templates (`:disabled="resendTimer > 0"`, named by text today). Fix by pre-stripping quoted attribute values or using a tolerant tag scan; add a fixture with a `>` inside an attribute.
- **Class: guard scan false negatives (second instance, same class)** — same scan exempts any button/link whose open tag contains a literal `v-bind=` attribute, even when the control is title-only and unnamed. Currently dormant (only Radix wrapper components use `v-bind=`), but it contradicts the test's stated guarantee.

No further findings of this class were found after grepping: `src/ui-app/src/**/*.vue` for `v-bind=`, `>`-in-attribute buttons, `removeAttribute("title")` sites (only `tooltip.ts`), `data-tip`-only icon controls, `aria-label` pins in the five touched components, `FloatingHeads.vue` `img alt` names, and leftover "Open the full-screen diff view" wording.

## Edge cases
- The task title names "Hub macOS and web", but the audit covers only the web UI. The macOS Hub already labels its icon buttons (`HubSidebarIconButton` requires `accessibilityLabel` + `.help()`), so nothing looks broken there, but `docs/qa/2026-11-labels-tooltips-audit-qa.md` never records that macOS Hub was checked or that native `.help()` tooltips are appropriate in a native app — one paragraph closes the gap.
- The ratchet's `<img alt>` allowance accepts any non-empty alt as a name; `alt=""` correctly does not.
- Dynamic `:aria-label` bindings are still caught (the substring matches), which the AgentCard pin uses — good.

## Suggestions
- The auto handoff capture is the home route and does not exercise any of the five changed controls; since the changes are invisible attributes plus a title, a screenshot can't show them — the guard test is the right evidence, and no re-capture is needed.
- The follow-up of moving a title→aria-label fallback into `tooltip.ts` is worth its own task, as the report says.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T21:59:21.833Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

