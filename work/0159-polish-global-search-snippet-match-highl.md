---
id: "0159"
title: "Polish global search: snippet match highlighting and documented doc-fetch strategy"
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/polish-global-search-snippet-match-highl
created_at: "2026-08-13T10:08:13Z"
updated_at: "2026-08-13T11:32:28Z"
---
## Problem

Task 0024 (global search: doc contents, fuzzy matching, history, status cues) is merged, but its automatic review flagged two spec gaps plus edge cases worth hardening.

1. **Snippet highlighting missing.** 0024's doc-content criterion called for a snippet "around the match"; the review interprets that as highlighting the matched term. Today the snippet is rendered as plain monospace text with no visual distinction of the matched query (SearchBar.vue).
2. **Architectural choice undocumented.** 0024 required picking client-side vs server-side doc-content search "based on real repo size" and justifying the choice. The implementation fetches every doc's content on mount client-side (`loadDocContents`) with no justification recorded — a scalability concern for large doc sets.

## Desired UX

- The matched query is visually highlighted (e.g. `<mark>`/styled span) within the doc snippet so the match jumps out, while the rest of the snippet stays as 0024 shipped it.
- The doc-fetch strategy is documented: justify client-side fetch against the current doc set size, and note server-side indexing as the path for large repos.
- Fuzzy matching on very short queries does not produce noisy false positives (a 1-letter query currently matches any word within 1 edit distance).
- Doc contents that fail to load degrade gracefully with a logged, diagnosable reason rather than a silent ignore.

## Acceptance criteria

- [ ] Matched term is visibly highlighted inside doc snippets; snippet content otherwise unchanged
- [ ] The client-side doc-fetch choice is justified in code/notes with reference to the real doc set size, plus a note on the server-side path for large repos
- [ ] Short-query fuzzy behavior is intentional or tightened (e.g. capped edit distance)
- [ ] `loadDocContents` failures are logged (not silent) and never break the UI
- [ ] Existing 0024 search behavior preserved; tests updated; `repoos check` passes

## Notes

- Reopens findings from the automatic review of 0024 (`.repoos/reviews/0024.md`).
- Zero runtime dependencies constraint applies; highlighting needs no new deps.

## Activity

- 2026-08-13T10:08:13Z · created · unknown
- 2026-08-13T11:32:28Z · status ready→review, branch
