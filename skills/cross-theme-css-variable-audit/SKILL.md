---
name: cross-theme-css-variable-audit
description: Diagnose color, contrast, and visibility issues across themes by auditing CSS variable usage against the codebase's theme token definitions.
---

# Cross-theme CSS variable audit

Use this when a UI component has color, contrast, or visibility issues across
multiple themes, especially both light and dark themes. A single-theme
regression is usually a local override; a multi-theme issue often means the
component references the wrong CSS variable.

## Procedure

1. **Identify the affected component files.** Search for the component name or
   section label across `*.vue` and `*.css` files.

2. **Read the component styles.** Inspect the component's `<style>` block,
   including scoped styles, and list every `var(--...)` reference. Pay special
   attention to variables used by `color`, `background`, `border`, gradients,
   and pseudo-elements.

3. **Read the global theme definitions.** Inspect the UI's global `style.css`
   and locate the token blocks, such as `:root`, `[data-theme="..."]`, and
   `@media (prefers-color-scheme: dark)`. Build a map of canonical variables:

   - Text: `--txt`, `--txt-dim`, `--txt-faint`
   - Surfaces: `--panel`, `--panel-solid`, `--panel-gradient`
   - Borders: `--border`, `--border-bright`
   - Accents: `--accent` for tints and backgrounds; `--accent-foreground`
     for readable text

4. **Compare the references with the definitions.** Flag every variable used
   by the component that is not defined by the global theme. An undefined
   custom property makes the containing declaration invalid when it has no
   fallback, so the browser may use the property's initial or inherited value.
   Also flag variables whose meaning does not match their use. Common examples:

   - `--text`, `--text-secondary`, `--surface`, and `--border-light` are not
     canonical here; map them to the appropriate `--txt`/`--txt-dim`,
     `--panel-solid`, or `--border` token.
   - `--accent` is a translucent tint, not a readable foreground color. Use
     `--accent-foreground` for text.

5. **Replace the incorrect references.** Choose the canonical token that
   matches the semantic intent: dim text uses `--txt-dim`, a separator uses
   `--border`, and so on. Preserve an existing fallback only when it is
   intentional and compatible with the theme system.

6. **Verify both theme families.** Rebuild with `bun run build:ui`, then check
   at least one light and one dark theme. Confirm the affected component has
   the intended text, surface, border, and accent contrast, and check nearby
   states for regressions.
