---
id: "0022"
title: "Add global search bar for tasks, context docs, and settings"
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/0022-global-search-bar
created_at: "2026-08-04T09:06:01Z"
updated_at: "2026-08-04T09:27:59Z"
---
## Activity

- 2026-08-04T09:06:01Z · created · unknown
- 2026-08-04T09:19:47Z · status inbox→ready
- 2026-08-04T09:19:47Z · status ready→active
- 2026-08-04T09:27:59Z · status active→review · implemented; ros check green

## Problem

There's no way to jump straight to something you know exists. Tasks live on the
dashboard/board, docs live in Context, and settings are their own page — each is
a separate view with its own browsing interaction. Finding one thing means
clicking through the right view and scanning. A single search bar fixes that for
all three kinds of content at once.

## Desired UX

- A search bar sits at the top (in the TopBar), with a subtle placeholder like
  "Search tasks, docs, settings…" and a shortcut hint (⌘K / Ctrl+K focuses it).
- Typing shows a dropdown of results, grouped by kind: **Tasks**, **Context
  docs**, **Settings**. Empty query hides the dropdown; no matches shows a short
  "No results" row.
- Matching is simple, case-insensitive substring matching against:
  - Task: id, title, and body
  - Doc: title and path (AGENTS.md, docs/**, etc.)
  - Setting: label and key from the config schema (visible fields only)
- Results are clickable and OPEN THE THING:
  - Task → opens the task drawer (same as clicking its card)
  - Doc → navigates to the Context view and selects that doc
  - Setting → navigates to Settings and highlights/focuses that field
- Keyboard: Esc closes the dropdown, ↑/↓ move through results, Enter opens the
  highlighted one. All behavior matches the existing drawer's Esc-close feel.

## Acceptance criteria

- [ ] Search input in the TopBar with placeholder + ⌘K/Ctrl+K focus shortcut
- [ ] Results dropdown groups Tasks / Context docs / Settings; empty query hides
      it; no matches shows "No results"
- [ ] Case-insensitive substring matching per the spec above (task id/title/body,
      doc title/path, setting label/key)
- [ ] Clicking a task result opens the task drawer; clicking a doc result
      navigates to Context and selects it; clicking a setting result navigates
      to Settings and highlights the field
- [ ] Esc closes, ↑/↓ + Enter work
- [ ] Works from every view (results are not view-local)
- [ ] `ros check` passes; no new runtime dependencies

## Notes for AI

- Search is CLIENT-SIDE and simple by design — no server-side search endpoint,
  no fuzzy scoring, no embeddings. This task is the first cut; richer matching is
  its own follow-up.
- The app this ships in is the Vite + Vue 3 SFC app under `src/ui-app/` (see
  0021). A new `SearchBar.vue` component in `src/ui-app/src/components/` mounted
  in `TopBar.vue` (which already has a `.spacer` between the repo pill and the
  connection dot — the search bar slots there naturally).
- Data sources are the existing stores, all already loaded in the app:
  - `useRepoStore().tasks` — Task[] (id/title/body available per task)
  - `useDocsStore().docs` — DocMeta[] (title/path); open a result by calling
    `loadDoc(path)` and `router.push("/repo")`
  - `useConfigStore().visibleFields` — ConfigField[] (label/key); navigate with
    `router.push("/settings")` and focus the field via its key
- Opening a task result: `useUiStore().openTask(task)` — this already refreshes
  from `/api/tasks/:id` and shows the drawer.
- Keyboard handling should live in the search component and attach/detach
  listeners cleanly (match the drawer's pattern); guard the ⌘K/Ctrl+K global
  shortcut so it doesn't fire when typing in an input.
- `ros check` is the bar for "did this break anything?" — the UI smoke test must
  stay green.

## Scope

- **This task**: the search bar, client-side simple matching, click-through to
  open each result kind.
- **Defer to a SEPARATE task**: fuzzy scoring / typo tolerance, search over
  doc *contents* (currently only titles/paths), server-side search index,
  saved/recent searches, searching outside web (CLI/agent).

## Related

- Builds on 0021 (the Vite + Vue 3 SFC app this feature lives in).
- 0020 (status-card → filtered work list) is a sibling "navigate to the thing"
  feature — consider matching interactions if they land first.
