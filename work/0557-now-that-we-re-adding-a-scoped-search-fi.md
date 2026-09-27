---
id: "0557"
title: Add a context-scoped search and real refresh feedback to the Context page
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-a-context-scoped-search-and-real-ref
created_at: "2026-09-27T16:21:15Z"
updated_at: "2026-09-27T17:23:58Z"
---
## Problem

Two things, one of them the reason this task exists.

**Context has no search of its own.** #0550 added a settings-scoped search so that when you are sitting on the Settings page, search looks at settings only. The Context page (`/repo`) has the same problem in a larger form — Docs, Skills, Discover and History tabs, a doc tree, a rendered doc pane — and the only way to find a doc today is to expand folders by hand and read titles. The global top-bar search does include context docs, but as the middle group of a tasks → docs → settings list, so on a busy board the doc you want is pushed below the fold.

**The docs list goes stale, and nothing says so.** A newly created context doc did not show up in the global search. Opening `/repo` and hitting the refresh button made the same search find it. Whatever the precise cause, the user-visible defect is real: search can be confidently wrong about what exists on disk, and nothing in the UI indicates the list being searched is out of date. The refresh button compounds this — it spins, then the page looks exactly as it did before, so a refresh that picked up three new files is indistinguishable from one that found nothing, or from one that failed.

## Desired UX

- The Context page header carries its own search control, visually consistent with the Settings one: same overlay, keyboard-reachable, same shortcut. Clicking it — or pressing ⌘K/Ctrl+K while on `/repo` — opens the shared search overlay **scoped to context**: context docs and skills only. No tasks, no settings.
- Every result is openable and none is a dead end. A doc result opens the Docs tab with that doc selected and rendered; a skill result opens the Skills tab with that skill selected. Each result shows enough to recognise it before you click — doc title and path, skill name and description.
- The scoped search returns **all** matches, or is explicit about how many it left out. A silent eight-item cap that reads as "that's everything" is the failure mode here, not a detail.
- The refresh button does visible work. On completion it reports what it found: how many files were added, how many changed, how many went away, or plainly that nothing changed. The report stays readable for a few seconds rather than flashing past. The existing error state stays.

## Acceptance criteria

- [ ] The Context page header has a visible, keyboard-reachable search control that opens the shared search overlay; ⌘K/Ctrl+K while on `/repo` opens the same thing. ⌘K behaviour on every other route is unchanged.
- [ ] The overlay is the **same component** #0550 extracted for Settings, driven by a scope/mode prop — not a second copy of the overlay markup. If #0550 has not landed on `main` yet, build against its contract rather than re-plumbing the top bar.
- [ ] Context scope returns docs and skills only: no task results, no setting results, and no group headers for a single kind.
- [ ] Matching and ranking reuse the existing doc/skill matcher and scoring in `src/ui-app/src/search.ts` (title, path, body content, fuzzy) so a query behaves the same as it does in the global overlay. Do not re-implement ranking, and do not change the global results order.
- [ ] The scoped result list is not silently truncated at `RESULT_CAP` (8 today). Either uncapped, or capped much higher with a visible "and N more". A truncated list always states the total.
- [ ] Clicking a doc result navigates to the Context page on the **Docs** tab with that doc loaded; clicking a skill result navigates on the **Skills** tab with that skill loaded. Both go through the existing `?doc=` / `?tab=` deep-link contract so the destination is shareable and the existing watcher does the work.
- [ ] Doc and skill **body** content is available to the scoped search, the same way the global overlay loads doc bodies. Fetch it once, cache it, and debounce keystrokes — no per-keystroke network storm.
- [ ] Overlay states are complete: a hint on empty query, an explicit "no context docs match …" message, and a hit list. Never a blank overlay.
- [ ] Keyboard and a11y: ↑/↓ move the highlight, Enter opens, Escape closes, focus is trapped while open and returned to the Context page's search control on close, and the overlay has an accessible name.
- [ ] Refresh reports a result. After a successful refresh the user can read what happened: counts of added / changed / removed files, or an explicit "no changes". The message persists long enough to read and does not disturb the doc tree or the selected doc.
- [ ] Reporting *changed* files requires data the API does not currently send. `DocMeta` is `{ path, title }`; extend the listing to carry an mtime (or size/hash) so a change is distinguishable from a mere presence. If the API is left alone, the report says added/removed only — it must not claim "changed" from a title comparison.
- [ ] The staleness bug is addressed, not papered over: a context doc created through the New doc dialog is findable in both the scoped and the global search without a manual refresh. Investigate before changing anything — the dialog already reloads the docs store, so the fix may not be where it looks. The scoped search must read the same store the app already maintains, not a private copy with its own fetch.
- [ ] Tests cover: scoped mode returns only docs and skills; a doc result deep-links to the right tab with the doc loaded; a skill result lands on the Skills tab; a truncated (if capped) result set reports its total; and the refresh summary reports added/changed/removed correctly. Extend `src/ui-app/tests/search.test.ts` / `deep-link-params.test.ts` rather than starting a new harness.
- [ ] `repoos check` is green, with no new console errors in the UI smoke pass.

## Notes for AI

Relevant code, confirmed by reading it:

- `src/ui-app/src/views/ContextView.vue` — header block (~lines 210–241), the tab row and refresh button (~243–265), `refreshDocs()` (~174–193), `ContextTab` / `TABS` / `setTab` (~34–47), the registry `skillQuery` + its debounce (~48, ~150–154), and the `?doc=` deep-link watcher (~195–206). The refresh button is currently rendered only on the Docs tab; the scoped search control should be available regardless of which tab is active.
- `src/ui-app/src/components/SearchBar.vue` — the overlay: `displayItems`, `groups`, `openResult` (~110–123), `loadDocContents` (~83), the `docList` watcher that makes content loading reactive (~197–203), and the Teleport comment explaining why the overlay is portalled. #0550 extracts this into a shared, scope-aware overlay; use that. Do not fork a second overlay for Context.
- `src/ui-app/src/search.ts` — `searchAll()` (~164–261) is tasks → docs → settings, `RESULT_CAP` is 8 (~25), `topByScore` (~157). Add a scoped entry point over the same helpers rather than a parallel ranker.
- `src/ui-app/src/stores/docs.ts` — `loadDocs` / `loadDoc` / `loadSkills` / `loadSkill`. The scoped search should search what this store holds (plus a body cache), not re-fetch the listings.
- `src/ui-app/src/types.ts:950` — `DocMeta` is `{ path, title }`; `src/server/server.ts:614` — `listDocs` stats entries but only returns path and title. This is the change needed for "changed" counts.
- `src/ui-app/src/components/NewDocPanel.vue` (~107, ~128, ~163) already calls `docs.loadDocs()` after creating a doc, which is the thread to pull on for the staleness bug.

Conventions and constraints:

- The overlay is a fullscreen overlay: it **must** be `<Teleport to="body">` (or a Radix `DialogPortal`), and its CSS belongs in `src/ui-app/src/style.css`, not a scoped block. Reuse the existing overlay classes; use the custom dropdown component for anything new — no bare `<select>`.
- No new runtime dependencies, no new endpoint, no search index, and no agent/LLM call site. If you add one, the `sessions` recording rule in `AGENTS.md` applies.
- **Assumption:** scope means context docs and installed repo skills. Discover is the remote skills.sh catalog and keeps its existing search field; History is a git log and is not indexed. If the scope could read as ambiguous in the UI, say which tabs are covered.
- **Assumption:** ⌘K on `/repo` opens the context-scoped overlay, same reasoning as #0550 on `/settings`. Everywhere else, unchanged.
- **Assumption:** uncapped result list, bounded only by what is on disk. If that turns out to be too slow or too ugly, cap it — but then show the total.
- **Optional:** a `?skill=` deep link mirroring `?doc=`, so a skill hit is shareable like a doc hit. Nice-to-have, not required.
- Docs to keep honest: `user-docs/concepts.md` describes the Context page. Update it only if this diff makes it wrong — don't go auditing the rest of `user-docs/`.
- Build with `bun run build:ui` (or `bun run build`) before trusting any output, and run `bun run fmt` before committing — the close-out gate is the first place formatting is enforced. Never run `repoos serve` yourself; request the managed preview with `::repoos-preview-request::`, or use `just serve-noauth` from this worktree.

## Scope

In scope:

- A Context-page search entry point and the context-scoped overlay, reusing #0550's shared component.
- Doc + skill body content available to that search, loaded once and cached.
- Open-on-click navigation to the right tab with the right item selected.
- A refresh that reports what it found, backed by the minimal API change needed to tell *changed* from *present*.

Deferred (explicitly not this task):

- Auto-refresh, polling or a file watcher for the docs list. Fix the observed staleness defect; do not build a sync mechanism.
- Scoped search on the Agents, Board, or Inputs pages (#0550 deferred those too).
- Searching the Discover catalog, commit history, or skill file contents beyond the doc-style body match.
- A full-text index, a fuzzy re-rank, or any change to global result ordering.
- Restructuring the Context page layout, the doc tree, or the tab set.

## Related

- `#0550` — the settings-scoped search this mirrors. Same shared overlay, same ⌘K-on-your-page pattern, same "no dead ends" bar.
- `src/ui-app/tests/search.test.ts`, `src/ui-app/tests/deep-link-params.test.ts` — existing coverage to extend.
- `user-docs/concepts.md` — the Context page description to keep in sync.

## Original prompt

Now that we're adding a scoped search field in settings page we should also add it to the context page. I just noticed a bug where newly created context docs were not found by the global search and when I went to the context page and hit the refresh button (which should have better feedback btw letting the user know that it really did refresh or how many new files or changed files there were...) then it did find what I was looking for in the search. but anyway this new scoped search in context page should just search within the context docs and skills etc (everything in the context page and various tabs there) and return all the matching docs to a search, whcih the user can click and it will open it.

## Activity

- 2026-09-27T16:21:15Z · created · hello@repoos.org
- 2026-09-27T16:23:57Z · status draft→inbox, title, area, body
- 2026-09-27T16:24:02Z · status inbox→ready
- 2026-09-27T17:23:58Z · status ready→active, branch
