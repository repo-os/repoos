---
task: "1221"
pass: 2
at: "2026-11-19T07:42:13.187Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-task-drawer-tabs-with-long-conte
state: ok
tree_identity: "0f9abe20f:"
---
## Verdict

`good to go` — production-drawer QA harness covers every named tab, both Changes panes, the shot viewer and all three widths; the pass-1 fixture-bypass finding is fixed.

## Relevance

`still relevant` — no other landed work covers long-content drawer QA at 375/768/1280 px, and the previous CSS-only fixtures don't drive the real drawer.

## Evidence

None

## Bugs

None found

No further findings of this class were found after grepping: `TaskDrawer.vue`, `useResponsiveLayout.ts`, `stores/ui.ts`, `vite.config.ts`, `env.d.ts`, `DiffFileViewer.vue`, the harness `entry.ts`/`fixtures.ts`, the other WebKit browser tests (`tablet-rail-layout-browser.test.ts`, `dialog-overlay-browser.test.ts`, …), `repoos.toml`, and the QA doc.

Pass-1's finding (**Fixture bypasses production behavior**) is resolved: the rewritten harness mounts the real `TaskDrawer.vue` through the production fetch → store → render path, clicks the real tab strip (verified: 8 `.tab-btn` including fullscreen, `drawer-tabs-scroll` gated on `innerWidth < 720` exactly as `useResponsiveLayout` computes it), exercises the real shot viewer open/close, the real `changes-tab-code` pane with inner-`<pre>` horizontal scroll, and asserts zero console/page errors. Selectors (`.md-card .md-rendered`, `.agent-log .agent-entry`, `.review-report-pane`, `.shot-row`, `.debug-events .debug-event`, `.diff-section*`) all exist in the component. I also verified WebKit is installed locally, so the `skipIf` gate actually ran this test in the green check rather than skipping it. No new bare `node`/`npm`/`npx` anywhere in the diff; `repoos.toml` untouched; no shots declared (tests+docs diff — `shots: skipped` is correct).

## Edge cases

- The fetch stub returns `{ ok: true }` for any unmatched endpoint; a future drawer endpoint added without a fixture answer renders junk silently instead of failing the test. A strict-404 fallback for `taskScoped` paths would make fixture drift loud.
- Viewport height is fixed at 800 px at all widths; short-landscape phone heights aren't exercised.
- The `HarnessEventSource` stub never delivers events, so live-update re-render paths (SSE task updates mid-drawer) are untested — acceptable for a geometry QA pass.

## Suggestions

- `fixtures.ts` embeds a `Math.random()` tail in `sentence`; the test process and the Vite bundle load different module instances, so the doc's "assertions can never drift" claim holds only for the deterministic parts (e.g. `fixtureShots.length`). Making the suffix deterministic would make the claim literally true.
- The harness defines `__REPOOS_COPY_INSPECTOR__: true` but omits the production config's `copyInspectorNodeTransform` Vue template transform, so the build is not byte-identical to production; passing `vue(copyInspectorBuild ? {…} : {})`-style options would match it exactly.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

