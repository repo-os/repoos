---
id: "0554"
title: Default the cost panel to 1 week and remember the selected range
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/default-the-cost-panel-to-1-week-and-rem
created_at: "2026-09-27T15:39:34Z"
updated_at: "2026-09-27T23:05:08Z"
---
## Problem

The AI-usage/cost panel on the dashboard opens on **all time**. That is the widest
possible window, so the headline cost, session count and per-day chart the user
lands on are lifetime totals rather than anything reflecting recent activity — the
numbers are technically right and practically useless for "what have we spent
lately".

Switching the window works, but the choice is throwaway: the selection lives only
in a component-level ref, so every page reload (and every fresh visit to the
dashboard) snaps back to the default. The user has to re-pick their window each
time.

## Desired UX

- On a first visit — no previously saved choice — the panel's range selector
  shows **1 week** selected, and the panel fetches and renders the 7-day window.
- The user picks any other window (1 day, 1 month, all time) and that choice is
  remembered by the browser.
- Reloading the page, or navigating away to the dashboard again later, restores
  the last window the user selected. The panel does not fall back to a default
  behind their back.
- **All time** remains available as an explicit choice — it just stops being the
  default.

## Acceptance criteria

- [ ] With no saved range, `boardUsageRange` is `"7d"` and the panel's initial
      fetch requests `/api/stats/board?range=7d`.
- [ ] Selecting a range persists it to `localStorage` under a `repoos.*` key, and
      the persisted value is read back on store creation so the selector's
      initial state is already the user's last choice.
- [ ] A hard reload restores the last selected range and fetches that range — it
      does not render the default first and then correct itself.
- [ ] All four options (`1d`, `7d`, `30d`, `all`) still render, with `1 week`
      and `all time` still present as labels.
- [ ] A missing, non-string, unknown, or corrupt stored value falls back to the
      `"7d"` default and does not throw (storage read is wrapped in `try/catch`,
      matching the existing localStorage helpers in the store).
- [ ] The Retry button and the no-argument `loadBoardUsage()` path still re-fetch
      the *current* window, not the default.
- [ ] The in-flight-discard behavior in `loadBoardUsage` is unchanged: a response
      for a window the user has since navigated away from is still discarded.
- [ ] Automated test coverage in `src/ui-app/tests/` for: default-is-`7d` with
      empty storage, persistence-then-restore across a fresh store instance, and
      the invalid-value fallback.

## Notes for AI

- **Primary files:**
  - `src/ui-app/src/stores/repo.ts` — `boardUsageRange` (declared near line 484,
    initialised to `"all"`) and `loadBoardUsage()` (near line 2099). The store is
    the single funnel for the selection: `UsagePanel.vue` only ever calls it, so
    persistence belongs here rather than in the component. That keeps any future
    caller consistent and makes the value available at store-creation time (the
    store setup body), before `UsagePanel`'s `onMounted` fetch.
  - `src/ui-app/src/components/UsagePanel.vue` — `RANGE_OPTIONS` and
    `selectRange()`. The option list and its labels should not need to change;
    the fix is the store's initial/persisted value, not the component.
  - `src/ui-app/src/types.ts` — `UsageRange` union. **Do not change it.** All four
    members stay valid.
- **Follow the existing localStorage conventions in `stores/repo.ts`:** a
  `repoos.`-prefixed key constant, a small defensive read helper that validates
  the parsed value against the union and returns the default on anything
  unexpected, and a write helper wrapped in `try/catch` (see `readSortOrder`,
  `readNewVersion`, `readIdSet`/`writeIdSet`). Write only when the selection
  actually changes, so a page load does not immediately re-persist the default it
  just defaulted to.
- **Update the stale comment** on `boardUsageRange` (currently "all is the default
  and matches the pre-range behavior, so it doubles as the initial selection") —
  it will be wrong after this change, and `AGENTS.md` requires keeping docs and
  comments honest against the diff.
- **Assumptions** (the request left these open; stated here rather than guessed
  silently):
  - Persistence is **per-browser only**, via `localStorage` — not per user, not
    server-side, not in `repoos.toml`. The user said "in local storage or
    something", and every other UI preference in this app (theme, sort order,
    panel toggles) is localStorage too, so this is consistent rather than novel.
  - The saved value is a bare range string; no wrapper object needed.
  - "1 week" is the existing `7d` option and "All time" is the existing `all`
    option. Neither the option set nor the label copy changes.
- **Not in scope:** the server route, `core/db`'s `UsageRange`, or the `/api/stats/board`
  response shape — all already support every window, including `7d`. The bug is
  entirely in the client's default and persistence.
- Because this is a client-side preference with no `repoos.toml` setting behind
  it, the "every feature setting needs a Settings UI control" rule in `AGENTS.md`
  does not apply. Do not add a `repoos.toml` key or a Settings tab for it.
- Run `bun run fmt`, `bun run test` and `repoos check` before handing off; add the
  new test alongside the existing store tests (e.g. next to
  `tests/repo-sort-order.test.ts`, which already sets up `createPinia()` and
  `localStorage.clear()`).

## Scope

**Covers:** the default window of the board AI-usage/cost panel, and per-browser
persistence of the user's last selected window.

**Deferred:** server-side or cross-device persistence of the preference; a
Settings-page control to pin a default window; persisting a window for the
per-task usage/token views; changing which windows are offered.

## Related

- Board-level usage stats and the date-range selector this adjusts are referenced
  in code comments as **#0230** and **#0334** — verify those ids against
  `work/` and correct this section if they are wrong.
- `docs/architecture.md` (UI state) if the localStorage preference convention is
  documented there — check and update if so.
- `AGENTS.md` — the localStorage-backed UI preferences it does not yet enumerate
  are a good place to note the new persisted key if the list exists there.

## Original prompt

Make the default for the costs to show '1 week' rather than 'All time', but also remember what the user last selected so it doesn't always show the default time period when the user reloads the page (so I guess keep it in local storage or something).

## Screenshots

![Screenshot-2026-09-27-at-23.38.27](/api/tasks/0554/attachments/screenshot-1.png)

## Activity

- 2026-09-27T15:39:34Z · created · hello@repoos.org
- 2026-09-27T15:39:35Z · screenshots
- 2026-09-27T15:40:32Z · status draft→inbox, title, area, body
- 2026-09-27T19:15:12Z · status inbox→ready
- 2026-09-27T23:00:49Z · status ready→active, branch
- 2026-09-27T23:05:08Z · status active→review
