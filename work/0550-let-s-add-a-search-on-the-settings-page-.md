---
id: "0550"
title: Add a settings-scoped search that jumps to the right tab
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-27T13:23:12Z"
updated_at: "2026-09-27T13:25:31Z"
---
## Problem

The Settings page has grown six tabs of controls (General, Notifications, Security, Advanced, Support, repoos.toml) and finding a specific setting by scrolling is slow. The only way to search settings today is the global top-bar search (⌘K), which is not a good tool for the job:

- **Settings are the last group in the global results.** `searchAll` concatenates hits as tasks → docs → settings, so on a big repo the settings you want are usually pushed out of view behind tasks and docs, even when you are already sitting on the Settings page and only care about settings.
- **Clicking a settings result often does nothing visible.** The result carries only the config `key`; the deep link is `?focus=<key>`, and `SettingsView.vue` only knows which tab owns a key through a hand-maintained `FIELD_TAB` map covering about ten keys. Anything outside that map is looked up in the wrong (or hidden) tab, the `setting-<key>` element isn't found, the retry loop gives up silently after ~2s, and the page just sits there. Concretely, searching `tailscale` surfaces `remoteValidation.tailscaleHost`, which has no `setting-*` row anywhere on the page — a dead end with no feedback.

## Desired UX

- The Settings page has its own visible search control (in the page header, next to the "Configuration reference ↗" link). Clicking it — or pressing ⌘K/Ctrl+K while on `/settings` — opens the *same* search overlay UI as the top bar, but scoped to settings only: one flat list of setting matches, no Tasks, no Context docs.
- Each result shows the setting's label, its config key, and the tab that owns it, so you can see where you're going before you click.
- Selecting a result takes you to the Settings page, on the **right tab**, and scrolls the field into view **centered**, with a brief visual highlight so your eye lands on exactly that control (the existing focus-flash treatment is enough). Focus lands on the field's input so you can just start typing.
- No result is ever a dead end: a setting that isn't rendered as a control on any tab still takes you somewhere useful (the `repoos.toml` tab, where the whole file is shown) and says so, instead of silently doing nothing.
- Empty query → recent searches / a hint. No matches → a clear "No settings match …" message. ↑/↓ to move, Enter to open, Escape to close; focus returns to the page's search control on close.

## Acceptance criteria

- [ ] Settings page header has a visible, keyboard-reachable search control that opens a search overlay; ⌘K/Ctrl+K pressed while on `/settings` opens the same thing.
- [ ] The overlay is **one shared component**, not a second copy of the top-bar markup. The global top-bar search keeps its current behavior and appearance everywhere else: tasks + docs + settings, same grouping and ordering, same recent-search memory.
- [ ] Scoped mode returns setting results only — no Tasks or Context docs results, and no group headers needed for a single kind.
- [ ] Ranking and matching reuse the existing settings matcher in `src/ui-app/src/search.ts` (label + key, fuzzy included) and its `RESULT_CAP`, so a query like `tailscale` or `n8n` behaves the same as it does in the top bar.
- [ ] Every result displays the owning tab alongside label + key (e.g. `Advanced · remoteValidation.tailscaleHost`).
- [ ] Activating a result lands on `/settings` with the correct `?tab=` **and** the field scrolled into view centered (`block: "center"`) with the temporary highlight class applied. The existing `?focus=` / `?setting=` deep-link params keep working unchanged.
- [ ] Tab ownership and the search index come from a **single source of truth**, so it cannot drift: adding a setting to the config schema and rendering it on a tab is enough for search to find it and jump to it. No parallel hand-maintained key→tab map that has to be remembered.
- [ ] A setting with no rendered row on any tab does not dead-end: it resolves to a real target (the `repoos.toml` tab) and the result communicates that, or the result is not offered as a one-click jump. Clicking a result is never a no-op.
- [ ] Overlay states are complete: recent/hint state on empty query, explicit no-match message, and a hit list — never a blank overlay.
- [ ] Keyboard and a11y: ↑/↓ move the highlight, Enter activates, Escape closes, focus is trapped in the overlay while open and restored to the settings search control on close; the overlay has an accessible name.
- [ ] Tests cover: scoped mode returns only settings; a deep link selects the right tab, scrolls, and applies the highlight; an unrendered key does not dead-end. Extend the existing `src/ui-app/tests/search.test.ts` / `src/ui-app/tests/deep-link-params.test.ts` rather than starting a new harness.
- [ ] `repoos check` is green, with no new console errors in the UI smoke pass.

## Notes for AI

Relevant code, confirmed by reading it:

- `src/ui-app/src/components/SearchBar.vue` — the global overlay (~308 lines: `displayItems`, `groups`, `openResult`, `onKey`, ⌘K handler). A setting result does `router.push({ name: "settings", query: { focus: r.key } })`. Extract the overlay into a shared component with a scope/mode prop; keep this file as the global entry point.
- `src/ui-app/src/search.ts` — `searchAll()` returns `[...taskHits, ...docHits, ...settingHits]` (hence settings last) and a setting result is only `{ kind, title, subtitle, key }`. Extend the setting result so it can carry the owning tab; don't re-implement ranking.
- `src/ui-app/src/views/SettingsView.vue` — `TABS` (~line 43), `FIELD_TAB` (~line 53, ~10 entries), `focusSetting()` (~line 508: `scrollIntoView({ block: "center" })`, adds `flash` for 2s, focuses the inner input), and the `focusKey` watcher (~line 547) with a silent `tryFocus` retry of 20 × 100ms. Only some rows carry `id="setting-<key>"` (hand-written ones plus the `v-for` groups at ~817, ~1194, ~1254, ~1293); many do not.
- `src/ui-app/src/style.css` — `.setting-row.flash` + `@keyframes setting-flash` (~line 652) already exist. Reuse them; do not add a second highlight system.
- `src/ui-app/src/stores/config.ts` — `searchableFields` is the existing index source.
- Docs to check for consistency as part of this change: `user-docs/configuration.md` (does it describe how to find a setting?) and the repoos.toml tab copy in `SettingsView.vue`.

Conventions and constraints:

- The overlay is a fullscreen overlay: it **must** be `<Teleport to="body">` (or a Radix `DialogPortal`) so it isn't trapped by an ancestor stacking context, and its CSS belongs in `style.css`, not a scoped block. Reuse the existing overlay/panel classes and the custom dropdown component if you add one; no bare `<select>`.
- **Assumption (change if you disagree, say so in the PR):** ⌘K/Ctrl+K while on `/settings` opens the settings-scoped overlay, since the user is on that page. ⌘K on every other page is unchanged. If this feels too clever, limit the scoped overlay to the click target only — but do not alter ⌘K behavior elsewhere.
- **Assumption:** `?tab=` + `?focus=` remains the navigation contract. Don't invent a third query param; keep the `?setting=` alias (#0345) working.
- **Assumption:** scoped mode shows a single flat list — no "Settings" group header, since the list only has one kind in it.
- Don't fix the dead-end by lengthening the retry loop. Make the target discoverable, or route the key to the `repoos.toml` tab.
- Don't change the global top-bar result ordering (settings last). The scoped overlay *is* the answer to that complaint; re-ranking the global list is a separate change.
- Optional, not required: also matching a field's `description` text would improve recall. Don't add a search index, a new endpoint, or a fuzzy-search rework, and don't restructure the settings page layout or move the tabs.
- No new runtime dependencies. The PM reminder applies: any LLM call site must record usage via `recordOneShotSession` — not applicable here, but don't add an agent call.
- Build with `bun run build` / `bun run build:ui` before trusting any `repoos` output or the UI. Do not run `repoos serve` yourself; if you want a browser check, request the managed preview with `::repoos-preview-request::` (or use `just serve-noauth` from this worktree).

## Scope

In scope:

- A visible settings-page search entry point and the scoped overlay.
- A shared/reusable overlay component (scoped mode implemented; the global top bar keeps its current behavior).
- Tab-aware, center-scrolling, highlighted navigation to a setting, including resolving keys that have no rendered row.

Deferred (explicitly not this task):

- Wiring the scoped overlay to other pages (Agents, Context, Board) — build it so a scope can be added later, but wire only Settings now.
- Reordering or promoting settings within the global top-bar results.
- Restructuring the settings page, moving tabs, or moving any setting to a different tab to make it easier to find.
- Making every schema key render as a first-class control on some tab.

## Related

- `#0345` — added `?setting=` as an alias of the `?focus=` deep link; this task builds on that mechanism rather than replacing it.
- `src/ui-app/tests/search.test.ts`, `src/ui-app/tests/deep-link-params.test.ts` — existing coverage to extend.
- `user-docs/configuration.md` — the settings docs to keep in sync.

## Original prompt

Let's add a search on the settings page since we have so many settings now and I find it hard to find what I'm looking for. We can re-use the same general search modal overlay but limit it to just settings when someone clicks the search on the settings page (we may re-use this funcationality later on other pages of the app too, but for now just settings page search). Also I know you can see the settings search results from the main top bar search, but the settings are at the end of the list, so it's not ideal when I'm on the settings page and I just am looking for a settings result. and when I clicked on the settings result (e.g. for tailscale) it didn't scroll me to the appropriate setting, maybe because I was already on the general tab and it was somewhere on that page, but anyway now it's not a great experience. what I would want it to do is get me to the right page, the right tab and scroll to center the thing I'm looking for. bonus points if it could highlight it somehow visually (temporarily to bring the user's attention to the exact thing they're looking for)

## Activity

- 2026-09-27T13:23:12Z · created · hello@repoos.org
- 2026-09-27T13:25:31Z · status draft→inbox, title, area, body
