---
task: "1255"
pass: 5
at: "2026-11-20T02:11:44.710Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-update-banner-version-display-an
state: ok
tree_identity: "1d49b7c52:1d49b7c529"
---
## Verdict

`good to go` — the pass-4 guard-coverage gap is fixed at the class level (file-level scan plus a static required-containers list), the overstated docs are corrected, and the harness false positive is fixed; captures are current for HEAD.

## Relevance

`still relevant` — the QA premise (banner, version display, release modal, list markers at 375/768/1280) holds and this round closes the last blocking finding.

## Evidence

None — all three captures (release-notes modal with visible bullets, systemd restart notice with the new plain-English copy, restart-failure alert naming the command) match their declared routes/states, routeMatched, zero console errors, and tree `1d49b7c529` differs from reviewed HEAD `8664c15fa` only by report/bookkeeping.

## Bugs

None found

No further findings of this class were found after grepping: every `v-html` in `src/ui-app/src` (11 renderer-importing files scanned, 6 non-markdown files correctly excluded — SearchOverlay, MobileTabs, Sidebar, FeedPanel, DiffView, SettingsView), the shared disc/decimal rule in `style.css` (all 8 REQUIRED_CONTAINERS present), `measure-update-banner.mjs` sibling `covered()` callers, bare `node`/`npm`/`npx` in the script, docs and package scripts (none; shebang `bun`, `node:` builtins only), and `repoos.toml` (untouched).

## Edge cases

- Open intermittent: one of eleven harness runs timed out waiting 5 s for "Restart is waiting" after Restart-when-idle; the 1.5 s status refresh predates this branch (#1073 era), so it is not a regression introduced here — honestly recorded as open in the QA doc.
- Markdown rendered by a child component is out of the scan's scope; the new comment and QA §4 say so explicitly instead of overclaiming.
- `release:restartPendingDark` renders light theme at capture: the App's theme store can re-apply after the fixture sets `dataset.theme` — the fixture state predates this branch and the notice itself renders correctly.

## Suggestions (non-blocking)

- Soak the supervised-restart harness scenario longer to explain or retire the 1/11 intermittent timeout.
- Trace why the App theme store overrides the `Dark` shot fixture, or have the component re-apply it on the same watcher the pinned fixture uses.
- Human follow-ups already recorded stand: one real hand-run restart on a disposable server, and the top-bar "New version available" button that bypasses "Restart when idle"/dismiss (follow-up task).

## Verdict

`good to go`

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T02:08:17.949Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

