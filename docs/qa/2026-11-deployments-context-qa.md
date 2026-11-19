# Deployments and Context pages: failures, long data and screen sizes

QA pass for #1238. Every case ran against fixtures in headless WebKit (`@playwright/test`), with no visible browser and no focus stolen. The real `DeploymentsView` and `ContextView` were mounted in jsdom with `fetch` answering fixture responses. The captured markup was then rendered with the built global stylesheet and each view's compiled scoped CSS at 375, 768 and 1280 px. No live server, git remote or provider was touched.

The harness is `src/ui-app/tests/deployments-context-qa-browser.test.ts` (12 cases × 3 widths). Plain-English failure copy is pinned by `src/ui-app/tests/deployment-failure.test.ts`.

## What was checked

| Page | Case | Fixture |
| --- | --- | --- |
| Deployments | Long data | Long service name, branch, URL, subdir, environment name and env error |
| Deployments | Refused push | `409` with multi-line git output and unbroken refs |
| Deployments | Status load failed | `500` from `/api/deployments` |
| Deployments | Not configured | `enabled: false` |
| Deployments | No targets | Enabled, zero rows and branches |
| Context | Long doc | Long nested path, unbroken URL, 600-char code line, wide Markdown table |
| Context | Docs load failed | `500` from `/api/docs` |
| Context | No docs | Empty listing |
| Context | Doc failed to open | `404` on the doc body |
| Context | Skills.sh failed | `502` from the skill registry |
| Context | Long skills | Unbroken skill name and description |
| Context | Header and tabs | Standard repo |

Each case asserts that no element sits outside the viewport and that no page box clips its own text sideways. Horizontal scrolling is accepted only inside code blocks and Markdown tables, which are built to scroll. Failure cases also assert their copy.

## What was wrong

Measured against the unchanged styles:

- **Deployments, `ff from <branch>` pill** had `white-space: nowrap`. A long branch name pushed it past the card at 375 and 768 px.
- **Deployments, Deploy buttons** kept `whitespace-nowrap` from the shared button. A long branch name in the label pushed the button past the viewport at all three widths.
- **Deployments, load failure** showed the server message in a `.dep-err` element with no CSS rule and no next step.
- **Deployments, refused push** showed raw git output with no explanation. Long lines had no box of their own.
- **Deployments, no targets** rendered an empty matrix and legend with nothing telling the reader why.
- **Context, header row** did not wrap. At 375 px the Refresh button sat outside the page's scroll box, so the page clipped 38 px sideways.
- **Context, doc body** showed `(could not load)` or `(error loading)` in place of a doc, with no next step.
- **Context, Skills.sh failure** showed the raw message with no next step.
- **Context, empty docs** said only "No docs found."
- **Context, long names at 1280 px.** The doc tree, doc title and path, and skill names did not wrap. The sidebar clipped them, and the first version of the audit missed this because it excused anything inside a horizontal scroller. The audit now flags unexpected sideways clipping, so that excuse no longer hides it.

A harness note: the Context view does not load docs on mount. `App.vue` loads them at startup, so the harness primes the docs store the same way before mounting.

## What changed

- **Deployments:** wrapping for the branch pill, service and provider names, env errors and the Deploy button label. Added the missing `.dep-err` rules. Added a refresh hint to load failures. Added an explicit empty-state panel when no targets exist, and hid the empty matrix and legend.
- **Refused push:** `deployFailureHint()` in `src/ui-app/src/lib/deployment-failure.ts` names the cause and the next step. The raw git output moves into a box that scrolls on its own, in both the dialog and the outcome panel. The copy avoids git jargon: a diverged branch is described as "different commits", and the text states that RepoOS never force-pushes.
- **Context:** the tab row wraps, so Refresh stays on screen. Doc and skill names, the doc title and path, and the doc body wrap. The doc and skill load failures now say what happened and what to do. The empty docs state says where to add a file. The Skills.sh error includes a "Try again" line. The docs-refresh error gained the same line.
- **Tests:** the harness and the helper table above. The helper's table is what the copy is checked against.

## Results

- Browser QA: 36 of 36 pass (12 cases × 3 widths).
- Helper unit test: 8 of 8 pass.
- Related existing suites (`deployments-view`, `docs-store-search`, `context-history`, the shot-fixture tests and `search-overlay-context`): 146 of 146 pass.
- Scoped `REPOOS_CHECK_CHANGED=main repoos check`: passed. Its test step ran on the remote runner, so the suites above are the local evidence.

## Not verified

- **Real devices and real data.** Nothing here ran on a phone or tablet. Widths were checked in WebKit at the three sizes only.
- **Live server, git remote and provider.** Every response is a fixture. A real refused push, a real provider build, and a real Skills.sh outage were not reproduced.
- **Dialog top edge.** The full-page capture at 375 px shows the refused-push dialog header above the frame. The capture is of a fixed overlay, so this may be an artefact, but it has not been confirmed in a real viewport.
- **Copy review.** The next-step wording is written, not reviewed by a human reader.
- **Native tooltips.** The disabled Deploy buttons still explain themselves through a native `title` attribute. The project convention forbids that in new UI. It was left as it was, outside this pass.
