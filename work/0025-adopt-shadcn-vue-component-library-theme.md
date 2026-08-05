---
id: "0025"
title: Adopt shadcn-vue component library themed to existing design
type: refactor
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/0025-shadcn-vue
created_at: "2026-08-04T09:36:55Z"
updated_at: "2026-08-05T16:22:31Z"
---
## Activity

- 2026-08-04T09:36:55Z · created · unknown
- 2026-08-05T07:16:09Z · status inbox→active
- 2026-08-05T08:00:14Z · status active→review · ai
- 2026-08-05T15:53:30Z · review loop: layer global CSS reset under @layer base so Tailwind spacing utilities apply (unlayered reset was silently nullifying them); add spacing-collapse regression guard to UI smoke test · ai
- 2026-08-05T16:20:00Z · review loop: give SelectItemText flex gap so status dot is no longer glued to its label; move html/body base rules into @layer base; add css-layers guard to repoos check (fails on any unlayered universal/bare-element selector) · ai
- 2026-08-05T16:18:32Z · review loop: space the status dot in the select TRIGGER value (line-clamp forced display:-webkit-box over flex, so used margin on the combobox .cdot); verified 8px gap + centered vertically · ai
- 2026-08-05T16:20:00Z · status review→done · nick

## Problem

The web UI (built in 0021) hand-rolls every interactive element — buttons,
drawer, task cards, selects, toggles, inputs. Hand-built controls drift over
time: inconsistent focus/disabled states, missing keyboard and aria behavior,
and every new screen re-invents the same patterns. 0021 explicitly deferred
adopting a component library to its own task. Tailwind is already in place
(Tailwind 4.3.3, `@tailwindcss/vite`); this task brings in the accessible,
themeable component layer to sit on top of it.

## Desired UX

- Adopt shadcn-vue (Radix Vue primitives + shadcn-style wrappers) as the
  component layer: buttons, dialog, select, switch, input, dropdown, card, etc.
- The EXISTING dark/neon/glass design language is preserved. shadcn-vue's
  default styling is a NEW look — do NOT adopt it. Theme every component to the
  existing CSS-variable tokens (`--bg`, `--panel`, `--cyan`, `--border`, etc.)
  so the app looks the same, just with correct a11y and consistent behavior.
- Migrate the hand-built components in `src/ui-app/src/components/` to the new
  primitives (TaskDrawer → Dialog, status select → Select, toggles → Switch,
  buttons → Button, cards → Card, the search dropdown stays bespoke unless it
  fits a primitive cleanly).
- This is a behavioral consistency pass, not a visual redesign.

## Acceptance criteria

- [ ] shadcn-vue installed and its tokens mapped to the existing theme
      variables (no default-look shadcn styling visible anywhere)
- [ ] TaskDrawer uses an accessible dialog primitive (focus trap, Esc, overlay)
- [ ] Status/priority controls use an accessible select/combobox
- [ ] Toggles, inputs, and buttons use the primitives with matching visuals
- [ ] Existing screens look and behave the same (compare against current
      screenshots/`bun run compare` oracle), zero console errors
- [ ] `ros check` passes

## Notes for AI

- Context: this was deferred by 0021's Scope ("shadcn-vue adoption is a
  component-library adoption that replaces hand-built components with a new
  design language — that's a redesign, not a port... deferred to its own task").
  The app today uses hand-built components matched to the tokens in
  `src/ui-app/src/style.css`.
- **New runtime dependencies** — this task authorizes adding them to the UI app:
  `radix-vue`, `class-variance-authority`, `clsx`, `tailwind-merge`,
  `lucide-vue-next` (and whatever shadcn-vue's installer pulls). The core
  engine's zero-runtime-dependency rule is unaffected (UI deps only, as with
  vue/pinia/router/tailwind).
- Do NOT restyle: the point is the same visuals with better a11y/consistency.
  Map `--cyan`/`--violet`/glass styles onto the primitive slots.
- Migrate incrementally, component by component, keeping `ros check` green
  after each step; the UI smoke test (mounts, no console errors) is the net.
- `ros check` runs compiled JS from `dist/` — rebuild (`bun run build`) before
  trusting output.

## Scope

- **This task**: adopt the library, theme it to the existing tokens, migrate
  hand-built components.
- **Defer to a SEPARATE task**: any deliberate visual redesign beyond mapping
  the current tokens (new look, new layout), and removal of the old `app.html`
  oracle (still needed for 0022/0024 parity checks).

## Related

- 0021: built the app this task refactors; originally deferred shadcn-vue.
- 0022/0024: the search bar (its dropdown may or may not adopt a primitive here).
