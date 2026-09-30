---
id: "0602"
title: Make Checks page use full main content width
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/make-checks-page-use-full-main-content-w
created_at: "2026-09-30T12:57:02Z"
updated_at: "2026-09-30T15:33:50Z"
---
---
id: "0602"
title: Make Checks page use full main content width
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/make-checks-page-use-full-main-content-w
created_at: "2026-09-30T12:57:02Z"
updated_at: "2026-09-30T15:29:58Z"
---
## Problem

The **Checks** route (`/checks`, `ChecksView.vue`) does not use the same horizontal layout as other primary RepoOS app pages. Content is capped (notably via a page-level `max-width` on `.ck-page`), so the plan, test-suite, runs, and remote tabs sit in a narrow column with unused space beside the main content area. That looks inconsistent next to peers such as Settings and Agents, and it wastes room for wide tables, step output, and run history. Task **#0602** screenshots show the mismatch.

## Desired UX

On desktop and typical tablet widths, the Checks page content spans the full width of the main content pane (the same usable width as other standard nav pages), with normal `.main` padding only—no artificial inner max-width on the page shell. Tab content (check plan steps, embedded panels) should breathe horizontally like comparable dense pages. After the fix, a human opening Checks beside Settings or Agents should not perceive a narrower “document column.”

Also document for future implementers that **standard app pages should use full main width** by default; narrow centered layouts are reserved for intentional exceptions (e.g. login/auth), not routine settings/data views.

## Acceptance criteria

- [ ] Checks page (all tabs: plan, test-suite, runs, remote) uses the full width of the main content area at common viewport sizes; no leftover empty gutter caused by a Checks-specific page `max-width`.
- [ ] Layout remains responsive on small screens (no new horizontal overflow on the page shell).
- [ ] Visual parity with other full-width app pages is obvious in side-by-side comparison (e.g. Settings or Agents vs Checks at the same window size).
- [ ] A durable rule is added in repo agent/docs guidance—**`AGENTS.md`** (UI conventions) and/or a short note in **`src/ui-app/src/style.css`** near shared `.page-*` / `.main` patterns—stating that new and existing standard views should not introduce arbitrary page-level max-width constraints unless there is a deliberate narrow layout (auth, modals, prose-only subsections).
- [ ] `bun run fmt` clean; `repoos check --changed main` passes (rebuild UI after view/CSS changes per AGENTS.md).

## Notes for AI

- **Primary code:** `src/ui-app/src/views/ChecksView.vue` — scoped styles include `.ck-page { max-width: 960px; }`; that (or equivalent constraint) is the likely fix target. Confirm whether child panels (`CheckRunsPanel`, `TestRunPanel`, `RemoteRunnersPanel`) add further width caps and adjust only as needed for Checks consistency.
- **Do not** restyle unrelated pages in this task; limit code changes to Checks plus the documentation/style note. If you spot other views with legacy max-width, mention them in the PR/task comment only unless they are one-line alignments clearly required for parity.
- **Assumption:** Subtitle/description text may stay readability-limited (e.g. `max-width` in `ch` on a `.page-desc`-like line); the user complaint is the **page shell**, not every paragraph.
- **Assumption:** Login and other intentionally centered flows stay narrow; the new rule should say “standard nav pages,” not “every route including auth.”
- **Docs placement:** Prefer extending the existing **UI sitemap / conventions** bullet block in `AGENTS.md` over inventing a new doc file; a one-paragraph comment in `style.css` is enough if it points agents at the shared page layout pattern.
- Use attached **#0602** screenshots as the before/after reference when validating.

## Scope

**In scope:** Checks page layout width; agent-facing convention so future pages default to full main width.

**Out of scope:** Redesigning Checks typography or tab chrome; changing global `.main` padding; landing page or `user-docs/` sites; CLI layout (see **#0591**).

## Related

- **#0602** — source request and screenshots
- **#0591** — width-aware CLI layout (unrelated to in-app Checks page)

## Original prompt

Make the "Checks" page fill out the full width, like all the other pages (and tell future agents in agents.md or style guide somewhere that every page should use the full width, aesthetically.

## Shots

```json
[
  {"target": "default", "route": "/checks", "label": "Checks — plan tab, full width"},
  {"target": "default", "route": "/checks?tab=runs", "label": "Checks — runs tab, full width"}
]
```

Before/after reference is the #0602 screenshots in the task's original prompt; a reviewer comparing with Settings or Agents at the same window size should see the same usable width, with no narrow centered column on Checks.

## Screenshots

![Screenshot-2026-09-30-at-20.54.51](/api/tasks/0602/attachments/screenshot-1.png)
![Screenshot-2026-09-30-at-20.54.59](/api/tasks/0602/attachments/screenshot-2.png)

## Activity

- 2026-09-30T12:57:02Z · created · hello@repoos.org
- 2026-09-30T12:57:03Z · screenshots
- 2026-09-30T12:57:03Z · screenshots
- 2026-09-30T12:57:35Z · status draft→inbox, title, area, body
- 2026-09-30T15:29:41Z · status inbox→ready
- 2026-09-30T15:29:58Z · status ready→active, branch
- 2026-09-30T15:33:50Z · body
