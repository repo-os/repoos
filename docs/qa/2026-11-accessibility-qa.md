# Accessibility QA: Settings, Agents, and Releases

Date: 2026-11-19

## Scope and method

This pass reviewed the Settings, Agents, and Releases views for keyboard navigation, accessible names and state, dialog structure, tooltip reliance, and focus styling. The review used the current Vue templates and shared UI primitives, focused component tests, and the repository's headless WebKit checks. No visible browser was opened and no user desktop focus was taken.

Settings already provides a named tablist, selected state, roving tab focus, and Arrow Left/Right, Home, and End navigation. Its panels are associated with their tabs. Mobile section navigation uses named navigation landmarks and buttons, exposes the disclosure state, and has a tested Escape path that restores focus to the section control. Search has an explicit accessible name and returns focus to its trigger. Restart badges have visible text and an accessible label. Native `title` attributes on restart badges and theme favorite buttons were redundant with that content, so they were removed; the screenshot caption's duplicate title was removed as well.

Agents exposed its section switcher as a row of ordinary buttons. A keyboard user could reach each button, but a screen reader could not discover a tablist or selected tab, and tabbing through the row required stopping at every section. This was the concrete accessibility defect fixed in this pass. The switcher now uses the tablist/tab/tabpanel pattern with a single tab stop, selected state, relationships between each tab and the active panel, and Arrow Left/Right, Home, and End navigation. The implementation preserves the existing query-string deep links. A regression test checks the roles, accessible label, selected state, roving tab index, keyboard activation, and focus movement.

The detected-agent rows had several native title-only explanations attached to visible text or already named controls. These titles did not add useful accessible information and were removed. The binary selector now has an explicit name that identifies the agent and the number of detected copies. The probing indicator now announces itself as a status. Favorite actions retain their explicit, changing accessible names and pressed state. The model refresh action keeps its visible action name, which is sufficient without its duplicate native tooltip.

Releases uses the shared dialog primitives for the release drawer and the follow-up choices. Dialog titles and descriptions are present, close actions have explicit names, and normal controls retain their visible labels. The shared content primitive wraps Radix Vue's dialog content, which supplies modal focus containment, Escape dismissal, and focus restoration. A focused shared-dialog regression test verifies its dialog name and description, prevents focus from escaping to an outside control, and restores focus to the opener after close. The scoped run also passes the headless UI smoke and release-related tests. No release-specific accessibility defect was identified in this review.

## Outcomes

- Settings: existing tab keyboard behavior, panel relationships, mobile disclosure state, and Escape focus restoration were reviewed alongside labeled controls. Redundant title tooltips were removed.
- Agents: added semantic tabs and keyboard behavior; named the binary selector and probing status; removed redundant title tooltips.
- Releases: reviewed release dialogs, names, descriptions, and button labels; retained the shared dialog implementation.
- Contrast: no palette or contrast rule needed changing. Existing shared focus-visible and theme tokens remain in use; no new color was introduced.

## Verification

The focused Agents view suite passed after the change, including the new tab keyboard test. The required `REPOOS_CHECK_CHANGED=main repoos check` is the final scoped gate for compilation, type checking, changed-path tests, and the headless UI smoke test. The gate result should be read from the handoff check record; this document does not claim a human screen-reader session or physical device test.

## Follow-up notes

This pass addresses browser-exposed names and keyboard operation through the rendered control semantics. Screen-reader output can vary by browser and assistive-technology pairing, so any later device-specific report should identify that combination and the affected control. The tab regression test protects the behavior that was missing here, while the shared dialog primitive keeps focus management consistent across views.
