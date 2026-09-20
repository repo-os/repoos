---
updated_at: "2026-09-20T12:35:03Z"
review_passes: 1
id: "0449"
title: Add lazy syntax highlighting to full-file diff views
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/add-lazy-syntax-highlighting-to-full-fil
created_at: "2026-09-19T16:20:19Z"
---
## Problem

The full-screen before/after file views render source as plain, line-split text. This makes larger diffs harder to review, especially across the varied stacks RepoOS is meant to support. Syntax highlighting must not make the UI unresponsive on large files.

## Desired outcome

Add accurate, read-only syntax highlighting to full-file diff views using Shiki or an equivalent TextMate-grammar highlighter. Do not use Tree-sitter for this task: RepoOS needs token colouring, not AST/editor features.

## Acceptance criteria

- [ ] Detect a language from the file path/extension and highlight both the before and after panes without breaking diff line numbers, additions, removals, wrapping, or side-by-side layout.
- [ ] Support a deliberately scoped initial set: TypeScript/JavaScript/JSX, Vue, JSON, TOML, YAML, Markdown, CSS, HTML, Go, Rust, Kotlin/Gradle, Java, Python, Bash, and SQL.
- [ ] Unknown or unsupported file types render safely as plain text.
- [ ] Load highlighter code, grammar, and theme only when a supported file is opened; do not put every grammar in the initial application bundle.
- [ ] Use the existing RepoOS light/dark appearance (or compatible themes) and preserve readable changed-line backgrounds.
- [ ] Put a defensible upper bound on highlighting work for very large files. Above that threshold, show plain text with a concise explanation and never block navigation or rendering.
- [ ] Escape source content correctly; untrusted repository text must not become executable HTML in the UI.
- [ ] Add focused tests for path-to-language detection, plain-text fallback, and safe/tokenized rendering, plus screenshots or UI coverage for representative web, Go/Rust, and Android/Kotlin files.
- [ ] repoos check passes.

## Implementation notes

The current full file/diff renderer is in src/ui-app/src/views/DiffView.vue. There is a small TOML-only regex highlighter in src/ui-app/src/lib/toml-highlight.ts, but it should not become a hand-maintained multi-language lexer.

Prefer Shiki fine-grained/lazy language imports over its complete bundle. A frontend build dependency is acceptable: it is bundled static UI code, not a new server runtime dependency or user-installed service. Keep the language map explicit and add a reliable text fallback.

Avoid Tree-sitter/WASM parser-per-language scope unless a future task needs structural semantics such as AST navigation, folding, or semantic diffs.

## Scope

In scope: read-only highlighting in full-file before/after views, performance guardrails, safe fallback, tests.

Out of scope: editable code views, code intelligence, AST semantic diffs, folding, repository-wide language configuration, and changing the normal compact changes list.

## Original prompt

Can we get proper text highlighting in code file views, particularly the full-screen before/after views? Shiki sounds good, especially lazy-loading languages and avoiding UI stalls.

## Activity

- 2026-09-19T16:20:19Z · created · unknown
- 2026-09-20T04:36:55Z · status inbox→ready
- 2026-09-20T07:22:40Z · status ready→active, branch
- 2026-09-20T07:55:23Z · status active→review

