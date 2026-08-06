---
id: "0052"
title: Fix frontmatter quote escaping so quoted task titles render cleanly
type: bug
status: active
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/fix-frontmatter-quote-escaping-so-quoted
created_at: "2026-08-06T17:38:14Z"
updated_at: "2026-08-06T17:56:18Z"
---
## Problem

Task titles that contain double quotes render with literal backslash-escaped quotes, e.g. `Replace \"branch\" terminology with \"worktree\" in task files and docs`. The root cause is an asymmetric round-trip in `src/core/frontmatter.ts`: `serializeScalar` escapes every `"` inside a double-quoted value as `\"` (line 121), but `coerceScalar` strips the surrounding quotes on read (lines 31-36) without ever unescaping the interior `\"`. Every read/write cycle therefore adds a backslash before each quote, so the stored value and the rendered title accumulate `\"` (and eventually `\\"`) noise that readers see verbatim in the CLI and web UI. This repo's own `work/0051-*.md` and `work/0005-*.md` are already affected.

## Desired UX

A task title containing quotes (e.g. `Replace "branch" terminology with "worktree" in task files and docs`) displays with plain quotes everywhere — CLI list, web UI, docs — with no stray backslashes, no matter how many times the file is parsed and re-serialized. Frontmatter quoting round-trips symmetrically: `parse(serialize(x)) === x` and `serialize(parse(y))` is stable.

## Acceptance criteria

- [ ] `coerceScalar` unescapes `\"` inside double-quoted frontmatter values so `"..."` parses back to the original string, symmetric with what `serializeScalar` emits.
- [ ] A title with embedded double quotes round-trips through parse → serialize → parse without gaining or losing backslashes.
- [ ] Titles without quotes and titles that only trigger quoting for `:`, `#`, `[`, `]`, `{`, `}`, `,` behave exactly as before.
- [ ] Existing tasks in `work/` whose stored titles already carry literal `\"` / `\\"` sequences (e.g. `0051`, `0005`) parse to the plain-quoted text, and their stored frontmatter is normalized to the canonical single-escape form so backslashes stop accumulating.
- [ ] The parser still reads every `work/*.md` file after the change.
- [ ] `repoos check` passes (build + typecheck + tests + UI smoke test) before setting `status: review`.

## Notes for AI

- The fix lives in `src/core/frontmatter.ts`. `coerceScalar` (parse path, around lines 31-36) is missing the unescape that `serializeScalar` (line 121) applies on write. All read/write flows route through these two functions via `task.ts`, `freeform.ts`, and `server/write.ts`, so no caller changes are needed.
- `serializeScalar` only escapes `"` inside the double-quoted form; single-quoted values are not escaped. Keep unescaping symmetric with exactly what the serializer emits (`\"`) so round-trips are idempotent. Do not attempt to implement general YAML string escape handling (`\n`, `\t`, unicode, etc.) — the serializer never produces those.
- Because backslashes have already accumulated in existing files, fixing the parser alone will leave one level of `\"` behind in titles that went through multiple writes (e.g. `0051` currently stores `\\"`). Repair those `work/` titles by hand as part of this task so they parse to plain text.
- This repo is self-hosted: task files are the roadmap and the parser change must not break reading any existing `work/*.md`.
- The `repoos` CLI runs from `dist/`; rebuild (`bun run build`) before trusting `repoos` output or running `repoos check`.
- Do not change the markdown body parsing, the task schema, or the web UI display layer; the bug is purely in frontmatter quote handling.

## Scope

**In:** unescape logic in `src/core/frontmatter.ts`, repair of the affected task titles in `work/*.md`, regression coverage for the round-trip.

**Deferred:** any YAML escape types the serializer does not emit (newlines, tabs, unicode), and any UI-level display changes.

## Related

- `0051` — task whose title currently displays the escaped backslashes
- `0005` — another task with backslash-escaped quotes in its title

## Activity

- 2026-08-06T17:38:14Z · created · unknown
- 2026-08-06T17:38:41Z · status inbox→ready
- 2026-08-06T17:56:18Z · status ready→active, branch
