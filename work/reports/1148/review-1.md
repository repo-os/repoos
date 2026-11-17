---
task: "1148"
pass: 1
at: "2026-11-17T04:50:30.594Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/settings-mobile-navigation-reduce-repeat
state: ok
tree_identity: "3647b2179:3f6ad3daa0"
---
## Verdict
`needs some work` — the new phone scroll containers clip the keyboard focus rings off both the tab rail and the section chips, so focus is invisible.

## Relevance
`still relevant` — the 390px composition still stacks two full navigation layers on `main`; this refinement targets exactly that, and no other landed task covers it.

## Evidence
Handoff captures are current (source `3f6ad3d`, HEAD differs by bookkeeping only): light 390px rail + "Browse all", dark 390px open panel with wrapped "Automation & approval", desktop 1440px strip. No blank captures, console clean, route matched, all assertions passed.

## Bugs
- **Class: focus ring clipped by scroll container** — `src/ui-app/src/style.css`: `.settings-mobile-nav` dropped the old 12px panel padding for `padding: 0 0 2px` + `overflow-x: auto` (overflow-y computes to `auto`), while `.settings-mobile-nav-btn:focus-visible` keeps `outline-offset: 2px`. The 2px ring at a 2px offset lies wholly outside the padding box, so all seven phone tab pills render **no** keyboard focus indicator. Same class: `.settings-page .settings-section-nav--phone` uses `overflow-y: auto` with `padding: 2px`, so the fourteen phone section chips' rings are fully clipped too. This breaks acceptance criterion "Keyboard and touch navigation remain usable" and contradicts the report's "visible focus" claim. The file already carries the fix for this exact class: `.settings-tab-btn:focus-visible { outline-offset: -2px }` with the comment "overflow clips at the padding box".

No further findings of this class were found after grepping: both narrow-mode scroll containers (`.settings-mobile-nav`, `.settings-section-nav--phone`), the desktop `.settings-tabs` strip (already inset), `.settings-section-jump-btn` (not inside a scroll container), and the existing `settings-save-only-changed` test that exercises the rail.

## Edge cases
Phone section chips stay at `min-height: 40px`, under the 44px house rule from #1139 — pre-existing, but they are now the main phone section control.
The `[activeTab, isNarrow]` watcher calls `scrollIntoView` whenever `isNarrow` flips, so crossing 720px while scrolled into a lower section snaps the page back up to the rail.
No outside-tap dismissal for the open section list; only the trigger toggles it.

## Suggestions
Add a fade/partial-affordance to the rail edge and consider scroll-snap: only ~10px of the fourth pill shows at 390px with the scrollbar hidden, so four of seven tabs are easy to miss.
Consider a small CSS test asserting `outline-offset` on outlines inside scrolling settings containers so this class cannot regress.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T04:44:21.625Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

