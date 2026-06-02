---
id: "0014"
title: Esc closes the top-most open overlay in the web UI
type: feature
status: inbox
priority: p3
area: ui
assigned_to: ai
created_by: nick
branch: feat/0010-esc-close-overlay
created_at: 2026-06-02T17:49:42Z
updated_at: 2026-06-02T17:49:42Z
---
## Activity

- 2026-06-02T17:49:42Z · created · unknown


## Problem

The web UI has dismissable overlays — the task drawer/panel, the new-task
modal, and more to come (settings, session detail, future dialogs). They can
currently only be closed by clicking the close button or the backdrop. Esc
doing nothing is a small but constant ergonomic friction for keyboard-driven
operators.

## Desired outcome

Pressing Esc closes the TOP-MOST open overlay — and only that one. If overlays
are stacked (e.g. a confirm dialog over the task drawer), Esc peels them off
one at a time, innermost first. With nothing open, Esc does nothing.

## Acceptance criteria

- [ ] Esc closes the single top-most open overlay, not all of them
- [ ] With multiple overlays stacked, repeated Esc closes them in reverse order
      of opening (last-opened closes first)
- [ ] With no overlay open, Esc is a no-op (does not break focus, scroll, etc.)
- [ ] Works for every current overlay: task drawer/panel, new-task modal — and
      is implemented as a shared mechanism so future overlays (settings,
      session detail) get Esc-close for free, not re-wired each time
- [ ] Closing via Esc is identical to closing via the button/backdrop — same
      cleanup, same state reset; no path-specific divergence
- [ ] Dirty-input guard: an overlay containing unsaved user input (e.g. a
      half-typed new-task form) must NOT silently discard on Esc. Either confirm
      ("Discard?") or exempt that overlay from Esc-close. Decide per overlay and
      document; default to protecting input.
- [ ] Esc inside a text input/textarea first blurs/cancels the field's own
      behavior as the browser expects, then on a second Esc closes the overlay —
      OR closes the overlay directly if that's the chosen behavior. Pick one,
      keep it consistent, don't let Esc do two conflicting things at once.
- [ ] The handler is cleaned up properly (no leaked global keydown listeners
      when overlays unmount)

## Notes for AI

- The correctness is entirely in the STACK. Implement a small shared overlay
  registry/stack the components register into on open and pop from on close,
  with ONE global keydown listener that closes only the top entry. Do NOT add a
  separate `keydown` listener per modal that each independently listens for Esc
  — that's how you get "Esc closes all of them at once" or unpredictable order.
- "Same as clicking close" matters: route Esc through the same close function
  the button uses, so any cleanup (state reset, focus return) happens once and
  consistently. Don't reimplement closing in the key handler.
- Guard against the dirty-input footgun. The new-task modal is the obvious case
  — losing a typed title to a reflexive Esc is a real papercut. Protecting it is
  more important than Esc-closing it.
- Avoid leaked listeners: register the global handler once (app level) reading
  the shared stack, rather than add/remove per component — fewer moving parts,
  no unmount leaks. (If per-component, ensure removeEventListener on unmount.)
- Keep it consistent with how overlays already open/close; don't restructure the
  overlay components, just add the shared Esc path.
- Frontmatter uses `created_at` (UTC/Z) per the current format — match 0007.

## Scope

- v1: Esc closes top-most overlay; shared mechanism; dirty-input protection on
  the new-task form.
- Reasonable to include now if cheap (nice-to-have, not required): focus-trap
  within the top overlay and focus-return on close, and click-outside already
  works — but don't let scope creep into a full a11y/focus-management overhaul.
  Note that as a follow-up if skipped.

## Related

- Pure UI ergonomics; foundation that future overlays (settings #0009, session
  detail) inherit automatically.
