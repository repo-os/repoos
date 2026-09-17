---
updated_at: "2026-09-17T09:49:39Z"
review_passes: 3
id: "0384"
title: Give Agents page lists card-like separation and widen the agent/model modal
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/give-agents-page-lists-card-like-separat
created_at: "2026-09-17T08:15:06Z"
review_rounds: 1
---
## Problem

The Agents page renders each agent with only a 1px top border and vertical padding — there is no distinct card surface, so when scanning the Default Agents list (and the other agent lists) it is genuinely hard to tell where one agent starts and the next ends. This is the same kind of squinting problem the Tokens tab had before #0380, which fixed it by splitting content into visually distinct cards the user now likes. The page should use that same card-like separation wherever agents are grouped.

Separately, the agent/model selector modal (Coding Agent + Model) is too narrow: its coding-agent buttons and model entries run out of room and wrap or crowd, when at desktop widths they could fit comfortably on a single line if the modal were wider.

## Desired UX

- Every place on the Agents page where agents are listed or grouped shows each agent as its own clearly bounded card — rounded corners, a real border, its own background surface, and visible spacing/gap between adjacent cards — so a human scanning the page can immediately tell where one agent ends and the next begins.
- The treatment matches the Tokens tab's section cards from #0380 for visual consistency (same border, radius, surface fill, and inter-card gap feel).
- The agent/model selector modal is wider on desktop so each coding-agent button and each model entry fits on one line where it reasonably can, while still shrinking to fit smaller viewports and never overflowing the screen.

## Acceptance criteria

- [ ] Each agent in the Default Agents list is rendered as a distinct card (border + radius + surface fill + spacing between cards), mirroring the Tokens tab's card treatment from #0380.
- [ ] Each agent in the Custom Agents list and the Build Your Team list gets the same distinct-card treatment.
- [ ] The Detected Coding Agents rows are also split into distinct card-like items so each detected agent is clearly separated.
- [ ] A disabled/`.off` agent still reads as one card, with its existing dimmed appearance preserved.
- [ ] Adjacent agents are visually separable without relying on close inspection of the divider line.
- [ ] The agent/model selector modal is wider at desktop widths and its agent/model entries fit on one line where the available width allows; on narrow viewports it still stays within the viewport (no horizontal overflow).
- [ ] No regressions to agent toggling, auto-save, the skills modal, or the detected-agents probe/refresh.
- [ ] `repoos check` passes.

## Notes for AI

- Primary files: `src/ui-app/src/views/AgentsView.vue`, `src/ui-app/src/style.css`, `src/ui-app/src/components/AgentModelModal.vue`.
- The #0380 pattern to mirror is the Tokens-tab section styling in `style.css` (`.task-sections` / `.task-section`): a flex column with a gap between cards, each card `border: 1px solid var(--border)`, a radius, and `background: var(--panel-solid)`. Reuse that look rather than inventing a new visual language.
- Today `.agent-card` is only `border-top: 1px solid var(--border); padding: 14px 0;` and `.detect-row` is the same idea — that is the root of the ambiguity. Upgrade them to full card surfaces with separation between siblings. Keep the existing `.agent-head` / `.agent-body` layout intact; this is a surface/separation change, not a re-layout.
- The modal (`AgentModelModal.vue`) is body-teleported, so its CSS lives in `style.css`, not a scoped `<style>` block. The relevant rule is `.am-modal.drawer-wrap.drawer`, currently `width: min(560px, 92vw)`.
- Assumption: the user's "max width of 50% or 500px or something reasonable" is a loose guide for a sensible desktop cap, not a literal value — and the modal is already 560px, so 500px would be narrower, not wider. Interpret the goal as "widen until entries fit on one line, capped at roughly half the viewport / a reasonable desktop maximum." Pick one concrete value (e.g. `min(50vw, 700px)` with the existing `92vw` fallback for small screens), and record the value you chose in the task activity.
- Do not fix the wrapping by forcing `white-space: nowrap` and letting content overflow; increasing the available width is the intended fix.
- After UI changes run `bun run build:ui` (or `bun run build`) so the worktree build is fresh. Do not auto-request a preview.
- Do not touch the Tokens tab, the model playground/providers panels, or the model-suggestion logic; keep this change scoped to presentation of the agent lists and the modal width.

## Scope

- In: card-like separation for every agent list on the Agents page (Default, Custom, Build Your Team, Detected Coding Agents) and a wider agent/model selector modal.
- Out: redesigning the Model Playground or Model providers tabs, changing model list contents or selection logic, and restyling the skills modal.

## Related

- #0380 — Tokens tab redesigned into distinct card-like sections; the visual pattern to mirror.

## Original prompt

I like the new look of the tokens tab fixed in task #380 and I want that same card-like separation on the agents page, e.g. the default agents list is hard to tell apart where 1 agent starts and ends and the next agent starts etc, so anywhere in the agents page where you can split agents into separate card-like things please do it so a human scanning it can make more sense of each agent. also somewhat related to this, in the agents/model selector modal let's make it wider so that the agents fit on 1 line if possible (but max width of 50% or 500px or something reasonable for desktop.

## Screenshots

![Screenshot-2026-09-15-at-13.05.19](/api/tasks/0384/attachments/screenshot-1.png)

## Activity

- 2026-09-17T08:15:06Z · created · hello@repoos.org
- 2026-09-17T08:15:06Z · screenshots
- 2026-09-17T08:16:54Z · status draft→inbox, title, area, body
- 2026-09-17T08:18:17Z · status inbox→ready
- 2026-09-17T09:24:43Z · status ready→active, branch
- 2026-09-17T09:26:23Z · status active→review
- 2026-09-17T09:45:30Z · status review→active
- 2026-09-17T09:46:12Z · note: Widened the Coding Agent + Model selector modal to width: min(700px, 92vw) via a new .am-modal-wide modifier (was min(560px, 92vw)), so the CLI buttons and model entries fit on one line at desktop widths while never overflowing small viewports. Scoped to AgentModelModal.vue only, so the skills modal keeps the narrower default. Card treatment (1px border, 10px radius, var(--panel-solid), 12px gap) applied to .agent-card and .detect-row.
- 2026-09-17T09:46:48Z · status active→review

