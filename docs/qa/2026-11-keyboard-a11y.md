# Web app keyboard and accessibility QA — November 2026

## Scope

Keyboard navigation was checked on Work, Settings, Releases and Agents using a
headless Playwright browser against the auth-less server from this worktree.
The pass covered initial Tab order on each route, the Agents Skills dialog's
focus containment, Escape dismissal and focus restoration, accessible names,
and automated contrast in light and dark themes.

## Finding and fix

The Agents Skills dialog close button had only an `×` glyph. It now has the
accessible name “Close dialog.” The shared Agent card's skills-add button had a
`title` but no accessible name; each instance now has the role-specific name
“Add skills to <role>.” The keyboard and accessibility regression test protects
both labels.

## Verification

The headless keyboard pass reached the first ten focus stops on each of Work,
Settings, Releases and Agents. On Agents, keyboard input opened the Skills
dialog; twelve Tab presses remained inside it; Escape closed it and returned
focus to “Add skills to engineer.” Releases' Preview action expands an inline
disclosure rather than a dialog, so Escape correctly left that preview open.

The changed-path test suite passed 185 tests across 11 files, including both
keyboard and accessible-name regression assertions. The rendered contrast
audit examined 15,292 visible text runs across 16 theme scopes and 14 screen
states, finding no text below the WCAG floor. The UI smoke test passed at 1440,
390 and 320 pixels in light and dark modes.
