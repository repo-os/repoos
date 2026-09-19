---
updated_at: "2026-09-19T01:31:14Z"
skill_suggestion: "0434"
id: "0433"
title: "New Skill Suggestion: Cross-theme CSS variable audit"
type: spec
status: review
priority: p2
area: web
assigned_to: human
created_by: ""
branch: feat/new-skill-suggestion-cross-theme-css-var
review_model_override: opencode-go/mimo-v2.5
created_at: "2026-09-19T01:04:15Z"
---
## Problem

Task #0432 (Fix colors in authentication & users settings section) completed a session that appears to contain a
non-trivial, reusable procedure: **Cross-theme CSS variable audit**.

This is an auto-generated suggestion from that session. Nothing is live as a
skill yet — approve it by turning the draft below into a skill file.

## Desired UX

If the draft is worth keeping, create `skills/cross-theme-css-variable-audit/SKILL.md` from it (edit
as needed) and close this task the normal way. If it is not, close it and
discard the draft.

## Draft skill (SKILL.md)

```markdown
---
name: cross-theme-css-variable-audit
description: Diagnose color/contrast issues across themes by auditing CSS variable usage against the codebase's theme token definitions.
---

## Cross-theme CSS variable audit

### When to use

Use this when a UI component has color, contrast, or visibility issues across **multiple** themes (both light and dark). Single-theme regressions are usually local overrides; multi-theme issues almost always mean the component references the wrong CSS variables.

### Procedure

1. **Identify the affected component file(s).** Grep for the component name or section label across `*.vue` and `*.css` files.

2. **Read the component's `<style>` block (or scoped styles).** Extract every CSS variable reference (`var(--something)`) the component uses, especially for `color`, `background`, and `border` properties.

3. **Read the global theme definitions** in `style.css`. Find the theme token blocks (e.g. `:root`, `[data-theme="..."]`, `@media (prefers-color-scheme: dark)`). Build a mental map of the canonical variable names:
   - Text: `--txt`, `--txt-dim`, `--txt-faint`
   - Surfaces: `--panel`, `--panel-solid`, `--panel-gradient`
   - Borders: `--border`, `--border-bright`
   - Accents: `--accent` (tint/background only), `--accent-foreground` (text)

4. **Compare step 2 against step 3.** Any variable the component uses that does NOT exist in the global definitions is silently falling back to its initial value (usually `transparent`, `currentColor`, or empty). Common telltale signs:
   - `--text`, `--text-secondary`, `--surface`, `--border-light` — non-existent in this codebase, should map to `--txt`/`--txt-dim`, `--panel-solid`, `--border`
   - `--accent` used as a text color — it is a translucent tint (`rgba(…)`) meant for backgrounds, not readable as foreground text. Use `--accent-foreground` instead.

5. **Fix by replacing undefined/misused variables with the correct canonical ones.** Match the semantic intent (dim text → `--txt-dim`, separator → `--border`, etc.).

6. **Verify across themes.** Rebuild (`bun run build:ui`) and check at least one light and one dark theme to confirm the fix and check for regressions.
```

## Activity

- 2026-09-19T01:04:15Z · created · unknown
- 2026-09-19T01:29:16Z · cli_override
- 2026-09-19T01:29:18Z · model_override
- 2026-09-19T01:29:24Z · review_model_override
- 2026-09-19T01:29:27Z · status inbox→ready
- 2026-09-19T01:29:39Z · cli_override, model_override
- 2026-09-19T01:29:41Z · cli_override
- 2026-09-19T01:29:46Z · status ready→active, branch
- 2026-09-19T01:30:42Z · status active→review

