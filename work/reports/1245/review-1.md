---
task: "1245"
pass: 1
at: "2026-11-19T21:02:13.515Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-docs-site-and-user-docs-navigati
state: ok
tree_identity: "be31d10b0:f45e1b009a"
---
## Verdict
`good to go` — the QA pass delivers the link check, three real fixes with tests, and the QA record; no defects found.

## Relevance
`still relevant` — the premise (docs nav/search/links unverified at phone widths) held and the work closes it; nothing on main supersedes it.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: bare `node`/`npm`/`npx` invocations across the diff (only `node:` protocol imports remain, correct for Bun); remaining `../` repo-relative links in `user-docs/*.md` (none left); other callers of changelog `#highlights`-style anchors (`changelog#` matches in `docs/`, `src/`, `user-docs/` — none); other `headingIds`-style id rewriters (only `scopeHeadingIds` remains, with the anchor `href` fix); `span.lang` rules in `custom.css` (single rule, no conflicting install-command override); spawned-preview teardown in `layout.test.ts` (`preview?.kill()` in `afterAll`, guarded).

## Edge cases
- `check-links.ts` now gates every build: a code sample in a doc containing a literal `href="…"` inside `<code>` would be picked up by the attribute regex and could fail the build spuriously. No such sample exists today; worth remembering when writing HTML examples in docs.
- `resolveTargetFile`'s traversal guard is a string `startsWith(distRoot + sep)`; real inputs come from `new URL()` pathnames (already normalized), and the test covers `/../../etc/passwd`, so it holds in practice.
- `scopeHeadingIds` only rewrites anchor links inside the heading element itself; an in-body link to `#highlights` inside a release note would still be unscoped — the build-time link check would catch it if one is ever added.
- Overlap gate is pixel-strict (`label bottom = 16px` vs `line top = 16px`); it passed against the real build, but fractional-pixel drift across font/OS updates could re-trip it — that failing loudly is the intended behavior.

## Suggestions
- The 16 new GitHub `blob/main` links and the `#…-0761` anchor are unverified (no network in the engineer's sandbox); open them once when online.
- `bun test scripts` in `user-docs/` (53 tests incl. the 18 browser checks) sits outside `repoos check`; wiring it into the `[[check.steps]]` plan needs a human edit to `repoos.toml`.
- The single auto capture shows the docs home page only (valid, not blank, route matched, zero console errors, and current — only bookkeeping changed since capture); nothing it shows contradicts the QA record's claims.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T21:00:32.944Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

