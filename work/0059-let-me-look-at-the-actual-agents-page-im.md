---
id: "0059"
title: Let me look at the actual Agents page implementation to g…
type: feature
status: inbox
priority: p2
area: general
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-08-10T23:07:22Z"
updated_at: "2026-08-10T23:07:22Z"
---
Let me look at the actual Agents page implementation to ground the Notes in real files.
---
title: Make the Save agents button unmissable when there are unsaved changes
type: feature
priority: p1
area: web
assigned_to: ai

## Problem

On the Agents page, the **Save agents** button lives at the very bottom of a
long scrolling page (default agents, custom agents, and the detected-coding-agents
section all stack above it), so it sits below the fold. A user can edit agent
settings and scroll back up through the list without ever noticing a save
affordance exists — the "unsaved changes" hint is a small, easily-overlooked
text label. The net effect: edits are silently at risk of being lost when the
user navigates away, exactly what happened to the reporter ("I totally missed
the Save Agents button at the bottom below the fold").

## Desired UX

The save action must be impossible to miss whenever there are unsaved agent
changes, and should recede when there is nothing to save.

- A **save bar that stays on screen while the user is editing** — sticky at the
  bottom (or top) of the page — so the save button is visible no matter how far
  the user has scrolled through the agent list. Scrolling should never hide it
  again.
- When there **are** unsaved changes, the save affordance becomes visually
  prominent: highlighted accent styling, explicit copy (e.g. "Save agents"),
  and a clearly visible "unsaved changes" indicator with context (e.g. "You
  have unsaved changes").
- When there are **no** unsaved changes, the bar is subtle / neutral so it
  doesn't nag when there's nothing to save.
- Leaving the page (or the app) with unsaved agent changes prompts for
  confirmation instead of silently discarding edits.
- The existing save behavior is unchanged: same validation, saving state
  ("Saving…"), and success/error messages.

## Acceptance criteria

- [ ] A save bar on the Agents page is sticky/always visible while editing, so
      the save button is on screen regardless of scroll position
- [ ] When the page has unsaved agent changes, the save button and an
      "unsaved changes" indicator are visually prominent (highlighted accent
      styling, clear copy); when clean, the affordance is subtle
- [ ] The dirty state tracks the same data as today's `dirty` computed (any
      difference between local agent edits and the loaded config)
- [ ] Navigating away from the Agents page with unsaved changes prompts for
      confirmation before leaving; navigating away with no unsaved changes does
      not prompt
- [ ] Save still validates agent names, shows "Saving…" while saving, and
      surfaces success/error messages as it does today
- [ ] `repoos check` passes

## Notes for AI

- **File to touch**: `src/ui-app/src/views/AgentsView.vue`. The save button +
  status row is at the bottom of the template (~lines 374–381); `dirty` is
  computed at line 42 (`JSON.stringify(localAgents.value) !==
  JSON.stringify(config.agents)`); `save()` is at line 86 and calls
  `config.saveAgents(...)` from the config store.
- **Why it's missed today**: the page is one long column (default agents,
  custom agents, detected-coding-agents card), so the save row sits below the
  fold on most viewports. A sticky save bar fixes the root cause; relying only
  on styling would not.
- **Assumptions** (the reporter did not specify layout): a bottom sticky bar
  is the default choice; keep the existing "Save agents" label and "Saving…"
  state; the existing success/error message slots and the per-agent validation
  in `save()` must be preserved. The navigation-away guard is assumed to be in
  scope — without it, a prominent button still doesn't prevent losing changes
  if the user leaves without clicking.
- **Reuse, don't reinvent**: keep using the config store's save path, the
  existing `Button` primitive, and the existing `dirty` computed as the source
  of truth for "unsaved changes". No new runtime dependencies.
- **Don't**: don't implement autosave (not requested), don't change the agent
  config schema or the server API, don't alter save validation semantics, and
  don't add the guard to pages other than Agents.
- **Self-hosting rule**: this repo runs itself — after the UI change run
  `bun run build:ui`, keep `repoos serve` running, and probe the page (dirty →
  prominent save bar; clean → subtle) in a browser before reporting done.

## Scope

- **This task**: making the save affordance impossible to miss on the Agents
  page when there are unsaved changes (sticky save bar + prominent dirty state)
  and confirming before discarding unsaved edits on navigation away.
- **Defer to a SEPARATE task**: autosave, keyboard shortcuts for save, applying
  the same unsaved-changes treatment to other pages (Settings, Context).

## Related

- `#0035` built the Agents page and its save path; `#0039` extended the same
  page with per-agent skills — this task is a UX hardening pass on that shared
  page, and should not conflict with either's field layout.

## Activity

- 2026-08-10T23:07:22Z · created · unknown
