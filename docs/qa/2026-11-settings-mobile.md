# Settings phone-width QA — November 2026

## Scope and method

Checked Settings at a 375 × 844 CSS-pixel viewport using headless WebKit against
the auth-less server started with `just serve-noauth` from this task worktree.
Visited General, Notifications, Security, Advanced, Import/Export, Support, and
`repoos.toml`. For each tab, checked document width, visible control bounds, and
browser errors. Opened the Settings search overlay, the General and Security
select menus, the Support manual report and screenshot viewer, and the Advanced
development-target editor. No data was saved or external action submitted.

## Findings

- All seven tabs stayed within the viewport; the document had no horizontal
  overflow. Visible buttons, inputs, textareas, and comboboxes stayed within
  their immediate parent bounds.
- The Settings search overlay measured 327px wide, the screenshot viewer 364px,
  and the settled development-target editor filled the 375px viewport with its
  form inset to 330px. General and Security select menus opened at 271px wide and
  stayed inside the viewport.
- The raw TOML editor keeps long source lines in its own editor surface; this
  does not widen the Settings page. The editor remains independently scrollable
  for editing those lines.
- Support had one real fit issue: at 375px, “Generate editable bug report with
  AI” was 279px wide inside a 261px action row and extended 18px beyond the
  padded content edge. The phone rule now allows the action label to wrap and
  constrains it to the row. After the change, the action is 261px wide, wraps to
  63px tall, and ends at the row edge.
- No page errors or console errors appeared during the pass. The manual report
  and screenshot viewer were opened and dismissed without submitting a report.

## Regression coverage

`src/ui-app/tests/settings-mobile-support-actions.test.ts` runs the action-row
layout in headless WebKit at 375px and verifies both buttons remain inside the
row and the long action wraps. It passed during this QA pass.
