---
task: "1116"
pass: 1
at: "2026-11-14T17:24:44.687Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/finish-touch-affordances-across-mobile-s
state: ok
tree_identity: "f438ad4f6:93ff053e4"
---
## Verdict
`needs some work` — New More-sheet agent launches can leave the mobile task drawer open under CTO/Ross panels; Debugger already closes it.

## Relevance
`still relevant` — Narrow layouts still wasted ~70px for fixed heads; this branch delivers the inset, preference, and surface touch polish #1112–#1115 did not fully close.

## Evidence
None

## Bugs
- **Class: drawer-stack coordination** — `FloatingHeads.vue`: `openCto` and `openRoss` only set `activeHead`, while `openDebugger` calls `ui.close()` so agent panels do not stack on the task drawer; More-sheet and `repoos:open-cto` / `repoos:open-ross` hit the new handlers.

No further findings of this class were found after grepping: `FloatingHeads.vue` (toggle/click paths, mount listeners), `MobileTabs.vue` (`openAgent`, `agentShortcuts`), `ReleasesView.vue` (`repoos:open-debugger` dispatch), branch diff for bare `node`/`npm`/`npx` spawn patterns.

## Edge cases
- More lists Open CTO/Ross/Debugger whenever heads are hidden, without `agentEnabled` gating used on the floating buttons.
- With heads hidden (default on narrow), `--page-bottom-inset` still reserves full head-stack height; extra bottom padding, but avoids layout jump when toggled on.
- `IntegrationStatusBar` / shell use `719.98px`; `FloatingHeads.vue` positioning still uses `760px` (pre-existing 720–760px band).

## Suggestions
- Handoff PNGs at 390px look usable: More sheet shows agent rows (e.g. Open CTO), Settings highlights the switch (default off) with narrow copy, Work shows the head stack over full-width content; routes matched per `1116.json`, zero console errors; capture tree `93ff053` vs HEAD `f438ad4` is bookkeeping-only per handoff note.
- After fix, a quick shot of opening CTO from More with a task drawer open would lock the behavior.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-14T17:23:55.234Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

