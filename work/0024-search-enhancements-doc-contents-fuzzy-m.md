---
id: "0024"
title: "Search enhancements: doc contents, fuzzy matching, recent searches"
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-04T09:17:40Z"
updated_at: "2026-08-04T09:17:40Z"
---
## Activity

- 2026-08-04T09:17:40Z · created · unknown

## Problem

The v1 search bar (0022) is deliberately simple: client-side, exact-substring
matching over task id/title/body, doc title/path, and setting label/key. That
leaves real gaps: a phrase that lives only INSIDE a doc (an ADR decision, an
AGENTS.md rule) is unfindable; a typo or slight misspelling returns nothing; and
there's no record of what you've searched for. Each of these was explicitly
deferred from 0022 to its own follow-up — this is that follow-up.

## Desired UX

- Typing in the search bar finds matches INSIDE doc contents, not just titles
  and paths, showing the doc as a result with a short matching snippet.
- Matching is tolerant of small typos / near-misses (fuzzy), so "task" finds
  "tasks", "tasts" doesn't dead-end.
- The dropdown shows recent searches (last N per session, or persisted), so
  re-finding something takes one keystroke.
- Results keep the 0022 behavior: grouped by kind, click-to-open the thing.

## Acceptance criteria

- [ ] Searching a phrase that appears only in a doc's content surfaces that doc
      with a snippet around the match (doc list is no longer title/path-only)
- [ ] Fuzzy/typo-tolerant matching returns near-misses instead of empty results
- [ ] Recent searches appear in the dropdown and re-run on click
- [ ] Existing 0022 behavior preserved: grouping, click-through, ⌘K/↑↓/Enter/Esc
- [ ] `ros check` passes; any new runtime dependency must be explicitly listed
      and justified (see Notes — it may be preferable to hand-roll)

## Notes for AI

- Builds on 0022's `SearchBar.vue` and the existing stores; do not land before
  0022 (this task references its component and behavior as the base).
- The doc-contents gap is the architectural crux: the docs store today fetches a
  doc's content only on select (`loadDoc`), so there is no in-memory corpus to
  match against. Options, in rough preference order:
  1. Server-side search endpoint (`/api/search?q=`) backed by an index built at
     startup/refresh — scalable, works offline-shell only for cached results.
  2. Fetch all doc contents once into the store and search client-side — simpler,
     but doesn't scale to large doc sets and makes the first search slow.
  Pick based on real repo size; the task should justify the choice.
- Zero runtime dependencies is a hard RepoOS constraint. Adding a search/fuzzy
  library (fuse.js, lunr, etc.) requires THIS task to authorize it explicitly.
  Small-scale fuzzing (edit distance ≤ 2, prefix matching) is easy to hand-roll;
  prefer that unless a library is clearly worth the dependency.
- Snippets: extract ~60-100 chars around the first match, highlight it, keep the
  match context readable in a monospace-friendly row.
- Recent searches: a small in-memory list is enough; persistence (localStorage or
  server-side) is a judgment call — note which you chose and why.
- `ros check` is the green bar; RepoOS runs compiled JS from `dist/` so rebuild
  (`bun run build`) before trusting output.

## Scope

- **This task**: doc-contents search, fuzzy matching, recent searches.
- **Defer to a SEPARATE task**: search from outside the web UI (CLI/agent
  commands, e.g. `ros search`), saved searches shared across instances,
  result ranking/weights, search over task comments/history.

## Related

- 0022: the v1 search this enhances (its `## Scope` explicitly deferred this
  work to "a SEPARATE task").
- 0019/0021 (PWA): offline-shell behavior affects whether client-side or
  server-side search is the right call.
