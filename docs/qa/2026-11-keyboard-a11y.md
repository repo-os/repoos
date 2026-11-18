# Web app keyboard and accessibility QA — November 2026

## Scope

The requested pass covers Work, Settings, Releases, and Agents, with focus order,
control names, overlay dismissal and light/dark contrast in scope. The task
worktree was reviewed for shared Radix dialog usage, Escape handlers and
accessible labels. The shared dialog wrapper is built on Radix Vue, which
provides modal focus containment, Escape dismissal and focus restoration; the
existing floating-layer regression test covers focus behavior for nested
teleported fields.

## Finding and fix

The Agents page's Skills dialog used a close button whose only content was the
`×` glyph. That is not a useful spoken action name for screen-reader users. The
button now has the explicit accessible name “Close dialog,” and
`src/ui-app/tests/keyboard-a11y.test.ts` protects that markup from regression.

## Verification

The focused Vitest run passed 21 tests: the new accessible-name regression and
the existing contrast-audit unit tests. `REPOOS_CHECK_CHANGED=main repoos
check` also passed. Its rendered contrast audit examined 16 theme scopes × 14
screen states (15,292 visible text runs) and found no text below the WCAG floor.
The configured UI smoke test passed as well, including its existing responsive
checks at 1440, 390 and 320 pixels in light and dark modes.

Live keyboard-only walkthroughs of Work, Settings, Releases and Agents were not
completed. The browser-control host reported that browser access was
unavailable, and no auth-less dev server was driven in this session. The
automated contrast audit and smoke run passed, but they do not establish
keyboard-only Tab order, Escape behavior or focus restoration on those four
screens. Those interactions remain to be verified in a browser session.
