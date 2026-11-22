---
task: "1258"
pass: 2
at: "2026-11-20T08:30:22.258Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/mobile-polish-open-on-work-hide-page-scr
state: ok
tree_identity: "94cbec74c:1dc4421246"
---
## Verdict
`needs some work` — the branch tip fails two committed tests; their fixes sit uncommitted in the worktree and must be committed before sign-off.

## Relevance
`still relevant` — the premise (Work home, hidden phone scrollbar, even header row) is unchanged and the implementation itself is sound.

## Evidence
None.

## Bugs
- **Class: uncommitted companion changes (branch-tip test staleness)** — `src/ui-app/tests/mobile-touch-affordances.test.ts`: the committed test still asserts the old per-control patterns the diff removed (`.theme-toggle { width: 44px`, `.repo-pill { min-height: 44px`, `.search-input { min-height: 44px` in the 900px block; the scoped TopBar `.help-menu-trigger,.user-menu-trigger` 44px block; the NoticeBell 44px block; `flex: 0 0 44px`). The committed `style.css` now uses `var(--topbar-control-h)`, so every one of those assertions fails on HEAD. The fixed version exists only as an uncommitted worktree file.
- **Class: uncommitted companion changes (branch-tip test staleness)** — `src/core/shot-targets.ts`: committed `router.ts` adds `/control`, but committed `APP_ROUTE_PREFIXES` doesn't list it, so `shot-target-support-0866.test.ts` ("keeps APP_ROUTE_PREFIXES in sync with the UI router") fails on HEAD. The one-line fix is the second uncommitted worktree file.

Effect: the green `repoos check` ran against the dirty worktree, not the reviewed commit; close-out's changed-path tests run on the branch and will fail. Committing both pending files (they look correct as written) and requesting a fresh review resolves it.

No further findings of this class were found after grepping: `src/ui-app/tests/*` (old CSS patterns, `repo-pill`/topbar/44px references, `loadingSkeletonKind("/")==="dashboard"`), `shot-target-support-0866.test.ts`, `LOADING_SKELETON_ROUTES` consumers, nav/`"/"` link references in `src/ui-app/src`, `docs/` and `user-docs/` for Mission-Control-as-home references, and `isAppRoute("/")` expectations.

## Edge cases
- Hidden phone scrollbar: `scrollbar-width: none` / webkit `display: none` don't disable touch or keyboard scrolling; rule is scoped to `.main > :not(.spin)` under 719.98px, desktop untouched. Fine.
- Unknown paths take a redirect chain (catch-all → `/` → `/work`); covered by the new test and works.
- Notice fallback link `?? "/"` in `stores/notices.ts` and the SW offline fallback now land on Work via the redirect — acceptable.
- Engineer's remote `ui-smoke` console errors (fonts/manifest on an offline host) are environmental, not this diff.
- Hub/device touch feel remains unverified on real hardware, honestly declared in the QA note.

## Suggestions
- Point the catch-all directly at `/work` to skip the two-hop redirect.
- The declared shot captured cleanly (Work home, topbar highlighted, no console errors) — no action needed.

## Verdict
needs some work — commit the two pending companion files (`mobile-touch-affordances.test.ts`, `shot-targets.ts`) and request a fresh review.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T00:36:47.624Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

