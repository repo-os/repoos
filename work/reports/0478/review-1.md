---
task: "0478"
pass: 1
at: "2026-11-18T01:53:03.845Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/add-repoos-org-project-updates-signup-an
state: ok
tree_identity: "bcf876369:dc41750bb2"
---
## Verdict
needs some work — a stalled request can hang the form forever, and without the endpoint configured the shipped form always fails.

## Relevance
still relevant — the landing slice is still needed; #0477 is still `inbox`, so the service contract remains a guess, but that doesn't invalidate the task.

## Evidence
None. The declared shot (1280×800) shows the closing CTA with `#project-updates` highlighted, the form intact, no blank/error state; zero console errors recorded.

## Bugs
- **Class: request lifecycle (timeout/abort)** — `landing/src/components/ProjectUpdatesSignup.vue` submit/fetch (lines ~31–55) has no timeout and no `AbortController`; a hung endpoint leaves `busy` true and the control disabled in “Sending…” with no recovery short of reload. The landing app's sibling form (`landing/src/components/EnquiryForm.vue`) already establishes the pattern: 15 s abort timeout plus `controller.abort()` on unmount. Same class also covers state updates after unmount.
- **Class: missing-config fallback** — `endpointOrigin` (line 7) defaults to `""`, then `endpoint()` throws on `new URL("")`; with the new variable unset or malformed in a Cloudflare build, the panel ships an enabled form that ends in “We couldn’t request updates just now” for every visitor. Render nothing/disabled copy when `endpointOrigin` is empty or invalid.
- **Class: deployment-doc accuracy** — `landing/README.md:170-171` tells the operator to set the variable in a “Cloudflare Pages project's build environment”, while the same file (lines 150-153) states deployment is a Wrangler **Worker** and that the Pages flow is gone; point at the Worker's build variables. The section also never states the subscribe response contract the client parses (`status`/`code` values, 409 duplicates), which #0477 must match.

No further findings of this class were found after grepping: `EnquiryForm.vue` (timeout/abort), both landing fetch call sites, landing README deploy/enquiry sections, `wrangler.jsonc`, `worker.ts`, root vitest include glob, and the diff for bare `node`/`npm`/`npx` (none).

## Edge cases
- Any 2xx payload without a recognised status is treated as success, including a `{ok:false}`-style body; the contract is unverified while #0477 is `inbox`.
- The cross-origin JSON POST needs CORS preflight support on the service; undocumented for #0477.
- A `?updates=…` return hides the form entirely, with no path back to signing up.
- Only a 1280 px capture exists; narrow-viewport overflow is covered by CSS/tests but not visually.

## Suggestions
- Use `--red` (or a neutral tone) for `expired`/`used`/`failed`; `.updates-message` is green for every outcome.
- Add tests for 409 duplicate responses, network rejection and the unconfigured-endpoint path.
- Give 429 a specific retry message, as the enquiry form does.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-18T01:49:31.078Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

