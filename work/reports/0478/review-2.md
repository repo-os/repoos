---
task: "0478"
pass: 2
at: "2026-11-18T02:08:32.546Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/add-repoos-org-project-updates-signup-an
state: ok
tree_identity: "b40b74e0b:b40b74e0b4"
---
## Verdict
`good to go` — EVIDENCE-GAP-ONLY: the signup-form capture shows the fallback, not the form; code and tests are sound.

## Relevance
`still relevant` — this is still the landing slice of story #0007; #0477 remains `inbox`, but the client is fail-closed and the contract is now documented for it.

## Evidence
- `landing-page-1.png` (declared "Project updates signup by the closing call to action", `/`): the panel renders "signup is temporarily unavailable" because `VITE_PROJECT_UPDATES_ENDPOINT` was unset in the capture environment. The input/button, pending/success/duplicate states, and narrow layout are not visible.
- No narrow-viewport capture; the engineer's 390×844 attempt failed with "Authentication required", so no-overflow is covered only by CSS and tests.

## Bugs
None found

No further findings of this class were found after grepping: `EnquiryForm.vue` and every `fetch(`/`AbortController`/`setTimeout` site in `landing/src`, both sides of `parseEndpointOrigin` (https/localhost, missing, malformed, credentials, path), every response branch (2xx/409/429/non-JSON/abort/unmount), `App.vue` placement, `style.css` tokens and the 640 px breakpoint, the landing preview target and `landing-build` check step, the vitest `tests/**` include, the README deploy section, and the diff for bare `node`/`npm`/`npx` (none). Pass-1 findings (timeout/abort, missing-config fallback, Pages-vs-Worker docs) are genuinely fixed, as are its suggestions (red theme, 429 copy, 409/network/unconfigured tests).

## Edge cases
- Confirmation returns to `https://repoos.org/?updates=expired` with no `#project-updates` fragment, and the component does not scroll itself into view. On a long landing page an email visitor lands at the top and may never see the result; the capture only looks right because the shot runner scrolls to the highlight.
- `parseEndpointOrigin` rejects `http://127.0.0.1:<port>` (localhost only); the README doesn't say so for local testing.
- Email validation is the browser's native `type=email`/`required` only — no custom inline message.
- The confirmation `role="status"` is present at mount, so screen readers may not announce it on arrival.

## Suggestions
- Re-capture shot 1 with the endpoint env set (the shot plan supports an `env` field) so the form and a 390 px layout are visible; keep the current fallback shot as an extra if useful.
- Add `#project-updates` to the documented redirect or scroll on `?updates=` mount.
- Note `localhost` (not `127.0.0.1`) for local `.env.local` testing.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-18T02:05:31.839Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

