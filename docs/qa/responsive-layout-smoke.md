# Responsive layout smoke check

The UI smoke command includes a viewport matrix for the main app screens:
Work, Agents, Settings, Checks, Releases, and a seeded task drawer. Each renders
at 375, 768, and 1280 CSS pixels using the same `shotState` preview fixtures as
review captures.

At each size the check fails if the document has horizontal page scroll, a
visible primary button extends beyond the viewport or a clipping ancestor, or
two wide fixed bars overlap. The check runs inside the existing headless WebKit
smoke harness, so it does not open a visible browser. Missing Playwright or
WebKit keeps the existing clean-skip behavior.

To run it locally after building, use `bun run smoke`. The overall UI smoke
step is also part of `repoos check`.
