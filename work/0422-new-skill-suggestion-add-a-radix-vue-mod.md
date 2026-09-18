---
id: "0422"
title: "New Skill Suggestion: Add a Radix Vue modal in RepoOS UI"
type: spec
status: inbox
priority: p2
area: web
assigned_to: human
created_by: ""
branch: ""
created_at: "2026-09-18T15:46:27Z"
updated_at: "2026-09-18T15:46:27Z"
---
## Problem

Task #0417 (Add fullscreen diff modal in changes tab) completed a session that appears to contain a
non-trivial, reusable procedure: **Add a Radix Vue modal in RepoOS UI**.

This is an auto-generated suggestion from that session. Nothing is live as a
skill yet — approve it by turning the draft below into a skill file.

## Desired UX

If the draft is worth keeping, create `skills/add-a-radix-vue-modal-in-repoos-ui/SKILL.md` from it (edit
as needed) and close this task the normal way. If it is not, close it and
discard the draft.

## Draft skill (SKILL.md)

```markdown
---
name: add-a-radix-vue-modal-in-repoos-ui
description: Use when adding any fullscreen/overlay dialog or per-row expand action in the RepoOS Vue UI, to avoid HTML-spec and accessibility failures that break `repoos check`.
---

# Add a Radix Vue modal in RepoOS UI

## When to use

You are adding a modal, fullscreen overlay, or a per-row action button (expand, open, etc.) to any
`src/ui-app/src` view or component (e.g. the changes tab in `TaskDrawer.vue`). The repo uses
**radix-vue** `Dialog` primitives and runs `repoos check` as the definition of done.

## Procedure

1. **Reuse the existing diff rendering** rather than reimplementing it. Find the current
diff/side-by-side component and render it inside the modal (see `TaskDrawer.vue` and the existing
diffs used in the changes tab).
2. **Build the modal with radix-vue `Dialog`** (`DialogRoot`, `DialogTrigger`, `DialogPortal`,
`DialogOverlay`, `DialogContent`). Teleported modal content's CSS lives in `src/ui-app/src/style.css`,
not in the view's `<style scoped>` block.
3. **Satisfy radix-vue accessibility requirements** or `repoos check` / runtime warnings fire:
   - `DialogContent` MUST contain a `DialogTitle` (wrap in `VisuallyHidden` if you don't want it
shown).
   - `DialogContent` MUST have `DialogDescription` or an `aria-describedby` attribute, otherwise a
   `Missing Description` warning is emitted.
   - radix-vue `Dialog` already handles the **Escape** key and overlay-click close for you.
4. **Do NOT nest a `<button>` inside a `<button>`** — Vue/logged warnings appear
(`<button> cannot be child of <button>`, HTML spec violation, hydration errors). If you need an
expand icon on a row that is already a button, either make the row a non-button wrapper
(`<div>`/`<li>` with a click handler + role) or move the action button outside the row button.
5. **Style consistently** with the rest of RepoOS (theme tokens; do not introduce unlayered
universal/bare-element selectors or low-contrast gradients — the theme contrast guard will fail).
6. **Format and verify**: run `bun run fmt` (the `.oxfmtrc.json` ignores `*.md`/`*.json`, so it's
safe on UI changes), then `repoos check`. Fix any formatting/lint failures first — `repoos check`
skips the full build when formatting fails, so a clean `bun run fmt` is required before the build
and tests run.
```

## Other candidate procedures

Identified in the same session but not turned into their own tasks (to avoid
spam). Mentioned here only:

- **Read and fix `repoos check` gate failures** — The ordered gate a RepoOS change must pass: staleness, lockfile, zero-runtime-deps, fmt/lint, build, CSS layering, theme contrast, bare require, task-asset, tests.

## Activity

- 2026-09-18T15:46:27Z · created · unknown
