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
button now has the explicit accessible name “Close dialog.” During the live
keyboard walkthrough, Chrome's accessibility tree also exposed the skills-add
controls on Agent cards as unnamed buttons: their `title` was not used as the
accessible name. Each now has the agent-specific name “Add skills to <role>.”
`src/ui-app/tests/keyboard-a11y.test.ts` protects both names from regression.

## Verification

The focused Vitest run passed 21 tests: the new accessible-name regression and
the existing contrast-audit unit tests. `REPOOS_CHECK_CHANGED=main repoos
check` also passed. Its rendered contrast audit examined 16 theme scopes × 14
screen states (15,292 visible text runs) and found no text below the WCAG floor.
The configured UI smoke test passed as well, including its existing responsive
checks at 1440, 390 and 320 pixels in light and dark modes.

The auth-less app was opened at `127.0.0.1:7273` and traversed with keyboard
input in Chrome. On Work, Tab reached the global actions, navigation links,
board filters and task actions in a coherent order. Releases rendered its
controls in the accessibility tree; the email Preview action expanded its
inline preview and Escape left it expanded, as expected for a non-dialog
disclosure. Settings rendered its section tabs and form controls. Agents
rendered role controls and exposed the unnamed skills buttons, which were fixed
above. The Skills dialog was not successfully opened in this browser pass, so
its keyboard trap, Escape dismissal and focus restoration remain unverified.
The automated contrast audit and smoke run passed, but they do not establish
those interaction details on all four screens.
