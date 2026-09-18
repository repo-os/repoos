---
id: "0424"
title: "New Skill Suggestion: Fix mobile horizontal overflow in RepoOS static sites"
type: spec
status: inbox
priority: p2
area: "landing, user-docs"
assigned_to: human
created_by: ""
branch: ""
created_at: "2026-09-18T17:31:51Z"
updated_at: "2026-09-18T17:31:51Z"
---
## Problem

Task #0410 (Fix mobile horizontal overflow on the landing page and VitePress docs site) completed a session that appears to contain a
non-trivial, reusable procedure: **Fix mobile horizontal overflow in RepoOS static sites**.

This is an auto-generated suggestion from that session. Nothing is live as a
skill yet — approve it by turning the draft below into a skill file.

## Desired UX

If the draft is worth keeping, create `skills/fix-mobile-horizontal-overflow-in-repoos-static-/SKILL.md` from it (edit
as needed) and close this task the normal way. If it is not, close it and
discard the draft.

## Draft skill (SKILL.md)

```markdown
---
name: fix-mobile-horizontal-overflow-in-repoos-static-
description: Use when a task requires eliminating horizontal scroll on phones (typically from wide code blocks) across the landing page or VitePress docs site.
---

# Fix mobile horizontal overflow in RepoOS static sites

## When to use

A task reports horizontal scrolling at 320–480px widths on `landing/` (Vite app) or
`user-docs/` (VitePress site), usually caused by long unbroken code blocks or
preformatted text that forces the viewport wider than the screen.

## Procedure

1. Identify each affected app as a **separate tree** — `landing/` (Vite) and
   `user-docs/` (VitePress, custom theme under `user-docs/.vitepress`). Do NOT
   touch `src/ui-app`; in-app UI overflow is handled by a different task/area.
2. For each tree, locate the global/layout CSS and constrain wide content so it
   scrolls inside its own container instead of the page:
   - Ensure `html, body { overflow-x: hidden }` / `max-width: 100%` on the page
     root so nothing forces page-level overflow.
   - Target code-block containers (`pre`, `.vp-doc pre`, fenced-code wrappers):
     set `max-width: 100%`, `overflow-x: auto`, and `white-space: pre` (not
     `pre-wrap` unless wrapping is intended) so long lines scroll horizontally
     inside the block.
   - Verify `box-sizing: border-box` and that no fixed `width`/`min-width` on a
     container exceeds the viewport.
3. Keep the desktop layout unchanged — scope rules to small widths with a media
   query (e.g. `max-width: 480px`) or rely on `max-width: 100%` which is a no-op
   on wide screens.
4. Verify against the **right preview target**, not the default RepoOS UI. Read
   the `[[preview.targets]]` entries in `repoos.toml` and use the named targets
   `Landing page` and `Docs site` to confirm no horizontal overflow at 320–480px.
   Desktop layouts must remain visually identical.
```

## Activity

- 2026-09-18T17:31:51Z · created · unknown
