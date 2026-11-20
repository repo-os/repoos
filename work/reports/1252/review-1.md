---
task: "1252"
pass: 1
at: "2026-11-19T23:21:22.291Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-error-pages-404-routes-and-deep-
state: ok
tree_identity: "e1401bcad:0dd0b9c3c5"
---
## Verdict
`good to go` — 404 view, desktop missing-task notice, tests and QA doc all check out against the spec.

## Relevance
`still relevant` — the silent catch-all redirect and the desktop-only silent `?task=` failure were real UX defects; nothing on main has superseded this work.

## Evidence
None — no declared shots existed, and the one auto capture (dashboard, zero console errors, healthy render on the branch preview build) cannot by design exercise a 404 or missing-task state. Visual proof of the new UI lives in the branch's own headless WebKit test (`deep-links-404-qa-browser.test.ts`), which asserts the real markup and built stylesheet at 375/768/1280 px with way-back controls inside the viewport; the capture is current (only bookkeeping changed after 0dd0b9c).

## Bugs
None found

No further findings of this class were found after grepping: catch-all `redirect:` siblings in `src/ui-app/src` (only the login `redirect` query and fetch `redirect: "manual"` remain), all `missingTaskId` set/clear paths in WorkView, `route.query` deep-link watchers (task/tab, Settings `activeTab`/`activeSection`, both fallback branches), archived handling in `stores/repo.ts` (`repo.tasks.find` includes archived, matching the QA doc), CSS variables used by the new rules (`--border-bright`, `--txt-dim`, `--panel`, all defined), bare `node`/`npm`/`npx` in the diff (none), and test registration (vitest auto-picks `src/ui-app/tests`, matching existing `*-qa-browser.test.ts` suites).

## Edge cases
- Pre-existing sibling of the same silent-fallback class, untouched by this diff: `/tasks/<unknown-id>/diff` renders an empty diff with no message (`repo.loadDiff` swallows the 404; `loadError` is wired only for commit diffs). Worth a follow-up task, not a defect here.
- On desktop, if a drawer for a previous task is open and a new `?task=` id fails, the stale drawer stays open beside the banner — cosmetic.
- Signed-out visitor on a bad link: the guard redirects to `/login?redirect=…` and the 404 view then renders after login — correct per the guard code, but untested.
- Reload on a failing `?task=` link re-runs the lookup and re-shows the notice (verified by reading `openFromTaskParam`), matching the QA doc's code-read row.

## Suggestions
- Next UI task, declare shots so the drawer shows the real states: `route: /no-such-page` and `route: /work?task=9999` on the `default` app target.
- Follow-up: give `DiffView` an unknown-task message, reusing `RouteNotice`.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T23:19:16.178Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

