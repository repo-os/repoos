---
id: "0383"
title: "Markdown renderer: inline code spans don't protect their content from later formatting passes"
type: bug
status: review
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/markdown-renderer-inline-code-spans-don-
review_model_override: opencode-go/hy3
created_at: "2026-09-17T07:55:51Z"
updated_at: "2026-09-17T07:59:34Z"
---
## Problem

`src/ui-app/src/lib/markdown.ts`'s `inline()` function applies a sequence of
regex `.replace()` passes for code spans, images, links, bold, italic,
strikethrough — in that order, each re-scanning the WHOLE string. The comment
on the code-span line says the intent is "fenced-style inline code first so
emphasis doesn't touch its contents" — but running it first doesn't protect
anything: backtick-quoted text becomes a `<code>` tag, and the original text
is still sitting there as literal characters for every SUBSEQUENT regex pass
to match against. Converting code spans to HTML first exposes their raw
content to every later transform instead of shielding it.

## Reproduction (confirmed live, 2026-09-17)

A code review report for #0382 contained the literal sentence (reviewer
describing markdown syntax as prose, correctly using backticks to quote it):
a phrase naming the function `appendScreenshotsSection`, followed by prose
describing that it dedups by "the rendered" backtick-quoted markdown image
syntax itself (an exclamation mark, bracketed alt text, parenthesized URL) —
i.e. the review text quoted markdown IMAGE SYNTAX inside a code span, as a
literal example of what gets rendered.

Rendered in the task drawer's Review tab, that code span shows as a
broken-image icon followed by the bare alt text — the image regex (line ~22,
which runs AFTER the code-span regex) matched the image-syntax text sitting
inside the already-emitted `<code>` tag and turned it into a real `<img>` tag
(broken, since the quoted "url" text isn't a real path) instead of literal
code text.

This isn't specific to images — the same gap means bold/italic/strikethrough/
links written inside a code span will also get incorrectly re-interpreted
(e.g. a code span containing `**not bold**`-looking text would render
literally bolded). Images are just the most visually obvious failure because
of the broken-icon.

## Blast radius

This is one shared renderer used broadly, not a one-off: `grep` shows it's
imported by `CTOPanel.vue`, `DebuggerChat.vue`, `ModelPlaygroundPanel.vue`,
`RepoGuideChat.vue`, `TaskDebuggerChat.vue`, `TaskDrawer.vue` (task
spec/review/PM/dev tabs), and `ContextView.vue` — any agent-authored or
human-authored text with a code span describing markdown-looking syntax is
affected, and agents describing code/config/syntax in prose is common.

## Fix direction

The general, correct approach for a sequential-regex inline renderer: extract
code spans (and check whether fenced code blocks, the separate `kind: "code"`
block type in the block parser, have the same issue or are already safe since
they're parsed as a distinct block type before `inline()` runs on other
content) into opaque placeholder tokens BEFORE running the other inline
passes (images, links, bold, italic, strikethrough), then restore the real
HTML-escaped content in place of each placeholder as the very last step. The
placeholder must not itself contain any character another pass's regex could
match — no square brackets, parens, asterisk, underscore, tilde, or backtick.
A simple approach: a short run of a rare, non-printable separator character
around an index number, with an array of the real `<code>...</code>` strings
restored by index at the end. Pick whatever the codebase's own conventions
elsewhere favor for this kind of "protect a substring from further regex
passes" pattern, if one already exists.

Verify escaping still happens correctly for the restored content — `s` is
already HTML-escaped before `inline()` runs (per the module's own top
comment: "escape first, then apply..."), so the extracted code content is
already safe; just don't let it pass through the OTHER regexes a second time.

## Acceptance criteria

- [ ] A code span containing image, link, or emphasis-looking syntax renders
      as literal code text, never as an actual image, link, or styled text.
- [ ] Regression test added to `src/ui-app/tests/markdown.test.ts` covering
      at minimum: an image-looking string, a link-looking string, and
      bold/italic-looking syntax, all inside a code span.
- [ ] Existing markdown.test.ts cases still pass — this must not change how
      code spans render when their content does NOT collide with another
      pattern (the common case).
- [ ] Fenced code blocks (the separate code block type) checked for the same
      class of bug; fixed too if found affected, or confirmed already safe
      with a one-line note why.
- [ ] `repoos check` passes.

## Related

- Found while reviewing #0382's own review report, which is what triggered
  this — the review text itself was fine; the renderer mangled it.

## Activity

- 2026-09-17T07:55:51Z · created · unknown
- 2026-09-17T07:58:26Z · review_model_override
- 2026-09-17T07:58:28Z · status inbox→ready
- 2026-09-17T07:58:30Z · status ready→active, branch
- 2026-09-17T07:59:34Z · status active→review
