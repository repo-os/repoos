---
task: "1250"
pass: 2
at: "2026-11-19T22:15:04.298Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-hub-macos-and-web-shared-strings
state: ok
tree_identity: "dfb33cb30:dfb33cb301"
---
## Verdict
`needs some work` — the guard's quote-awareness was fixed only for the open tag; the body scan still silently skips unnamed icon buttons whose child elements carry `>` in an attribute.

## Relevance
`still relevant` — the title-stripping defect is real (`tooltip.ts` `textFor()` removes `title` on first hover/focus), all five affected controls got `aria-label`, and the audit doc is committed; nothing on main supersedes it.

## Evidence
None

## Bugs
- **Class: guard scan false negatives** — `src/ui-app/tests/icon-control-names.test.ts`: round 1's fix made only the *open tag* regex quote-aware. The body cleanup `.replace(/<[^>]+>/g, "")` is still quote-blind, so a child element inside the button whose attribute contains `>` leaves residue text that counts as "visible text" and the unnamed, title-only control is silently skipped. Verified against the shipped function: `<button title="Next" @click="go()"><span v-if="count > 0"><ChevronRight /></span></button>` and the `:class="i > 0 ? 'on' : 'off'"` variant both return **no** offender. No real template currently hides behind it (the repo-wide scan passes with zero offenders), but the ratchet's guarantee is broken the same way round 1 flagged — the fix is incomplete, and a future icon-only button with `v-if="n > 1"` on a child will pass the guard unnamed. Fix: strip quoted attribute values from the body before tag-stripping, or reuse the quote-aware tag matcher; add a fixture for `>` inside a *child* attribute.

No further findings of this class were found after grepping: `src/ui-app/src/**/*.vue` for `v-bind=`, `title`-only icon controls (none remain), `removeAttribute("title")` sites (only `tooltip.ts`), old "Open the full-screen diff view" wording (only code comments left), the six `aria-label` pins in the touched components, `FloatingHeads` img-alt names, tests asserting the old diff wording (none), and `macos/RepoOSHub/*.swift` `accessibilityLabel`/`.help()` pairing (verified in `HubSidebarControls.swift`).

## Edge cases
- Round-1 items all verified fixed: quote-aware open tag, `v-bind` exemption removed with fixture, `alt=""` fixture, and the macOS Hub paragraph now in the audit doc.
- The audit honestly states no screen-reader or visual check was run; the auto capture is the home route and can't show attribute changes — acceptable as evidence.
- Merge with main: only this task's own `work/1250-*.md` conflicts; close-out resolves from main. Not re-run per the server-computed checklist.

## Suggestions
- Reuse one quote-aware tag scanner for both open tags and body cleanup instead of two regexes — it removes the class entirely.
- The `tooltip.ts` title→`aria-label` follow-up deserves its own task, as the report already says.

## Verdict
`needs some work` — incomplete round-1 fix in the guard test's body scan (same class, one residual instance).

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T22:13:49.524Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

