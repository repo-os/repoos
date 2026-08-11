---
id: "0065"
title: Freeform task creation titles an unclosed-frontmatter task as the literal --- delimiter
type: bug
status: done
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/0065-fix-unclosed-frontmatter-freeform-title
created_at: "2026-08-11T00:06:00Z"
updated_at: "2026-08-11T00:22:50Z"
---
## Activity

- 2026-08-11T00:06:00Z · created · unknown

## Problem

Freeform task creation can produce a task whose title is the literal `---`
delimiter instead of the real title. Repro: task #0064 ("Add per-task agent and
model overrides…") was created via the freeform pane and its file is:

```markdown
---
id: "0064"
title: ---
type: feature
...
---
---
title: Add per-task agent and model overrides to the task Agent tab and freeform creation
type: feature
priority: p2
area: web
assigned_to: ai
## Problem
...
```

The real frontmatter (with the actual title) was written **into the body**, and
the top-level `title` is `---`. Root cause (reproduced against the parser):

1. The PM agent emitted a document with an opening `---` line but **no closing
   `---`** (unclosed frontmatter).
2. `parseDocument` (`src/core/frontmatter.ts:50`) only honors a closed
   frontmatter; an unclosed one returns `{ data: {}, hadFrontmatter: false }`
   with the whole input as body — no error, no signal.
3. `parseGeneratedTask` (`src/server/freeform.ts:47`) then takes the
   no-frontmatter fallback: `title: explanationTitle(output)`.
4. `explanationTitle` (`src/server/freeform.ts:28`) picks the **first non-empty
   line** as the title — which is the literal `---` delimiter.

So an agent's minor formatting slip turns into a corrupted task title that is
also unfindable in search and confusing on the board. 0064 is the concrete
instance; the same slip can recur on any freeform generation.

## Desired UX

Freeform creation must never produce a `title` of `---` (or other delimiter
junk). A task created from a generated file whose frontmatter was left unclosed
should still get the real title parsed out of it, with the body intact and the
file normalized to a single well-formed frontmatter block.

## Acceptance criteria

- [ ] `parseDocument` treats a document that starts with `---` but has no
      closing `---` as **frontmatter terminated by EOF** (YAML documents may
      end without a trailing separator): parse the region after the opening
      delimiter as frontmatter and return the remainder as body. (Confirm this
      doesn't regress the `hadFrontmatter: false` path used by the raw-draft
      fallback or the indexer.)
- [ ] Defense in depth: `explanationTitle` and the `parseGeneratedTask`
      no-frontmatter fallback skip delimiter lines (a line that is exactly
      `---`) when picking the title line, so a title can never be `---` even
      when the lenient parse can't apply.
- [ ] Round-trip fix: `repoos new`-style rewrite of an affected file
      (serialize via `serializeDocument`) yields ONE frontmatter block with the
      real title, and the duplicated frontmatter keys (`type`/`priority`/
      `area`/`assigned_to`) currently embedded in the body are not misparsed.
- [ ] Freeform path test: a fixture feeding an unclosed-frontmatter agent
      output through `parseGeneratedTask` → `createTask` produces a file whose
      frontmatter `title` is the real title and whose body contains the
      sections, not a second `---` block (fakebin pattern).
- [ ] `repoos check` passes; zero new runtime dependencies.

## Notes for AI

- **Files to touch**: `src/core/frontmatter.ts` (`parseDocument` — EOF-terminated
  frontmatter; keep the zero-dep hand-rolled YAML subset), `src/server/freeform.ts`
  (`explanationTitle` + `parseGeneratedTask` fallback), plus tests in
  `src/ui-app/tests/freeform.test.ts` and any `frontmatter` test file.
- **Beware the indexer**: `parseDocument` is shared with the repo indexer
  (`src/core/indexer.ts`) and the CLI parser — a file in `work/` that begins
  with `---` is frontmatter by RepoOS convention, so lenient EOF termination is
  safe there; just verify no existing task file in this repo regresses
  (run `repoos index` + `repoos check` after the change — this repo is
  self-hosted).
- **Don't** change the draft-fallback behavior (raw explanation saved when the
  PM agent is missing/fails) — it must keep working; only fix the title
  derivation so it never returns `---`.
- **Existing damage**: #0064 already has the malformed shape on disk. RepoOS
  preserves unknown/malformed frontmatter, so a naive re-serialize of that file
  via the current serializer would keep the mess — the fix should make a
  re-serialized 0064 come out clean. Do not hand-edit 0064 in this task unless
  the fix itself produces the clean shape.

## Related

- 0036 · Freeform task creation via the PM agent (the flow that feeds this)
- 0052 · Frontmatter quote-escaping fix (prior parser hardening; same file)
- 0064 · the concretely-affected task (regression evidence)

## Activity

- 2026-08-11T00:07:55Z · status ready→active
- 2026-08-11T00:18:36Z · status active→review
- 2026-08-11T00:22:39Z · status review→done
