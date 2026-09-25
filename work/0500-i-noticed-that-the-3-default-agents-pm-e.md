---
updated_at: "2026-09-25T06:19:21Z"
review_passes: 1
id: "0500"
title: Deduplicate agent cards and compact the Agents page
type: refactor
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/deduplicate-agent-cards-and-compact-the-
created_at: "2026-09-25T06:04:32Z"
---
## Problem

The Agents page renders every agent card from **three copy-pasted blocks of
markup** in `src/ui-app/src/views/AgentsView.vue` — one each for the
Default agents, Custom agents, and Build-your-team panels. Each block is the
same card structure (header with name/badge/toggle, "Coding agent + Model"
row, Compatibility row, Instructions field, skills field) with only small
per-section differences. Any change to one card (like the skill picker) has
to be made in triplicate, which is how UI drift between the sections starts.

On top of the duplication, three details make the page harder to use than it
should be:

- The three headless defaults display in seed/config order — **engineer,
  reviewer, pm** — which reads as an arbitrary jumble and confuses users
  (`src/core/config.ts` `DEFAULT_AGENTS` order; `headlessAgents` computed in
  `AgentsView.vue` does no re-sorting).
- **"Add skills to agent"** is a full `variant="outline"` button — visually
  one of the loudest controls on the card, despite being the least important.
- The skills area takes multiple lines (label row, a ⓘ help line, then the
  selected-skills summary on its own line), and the Instructions textarea is
  always expanded with `rows="2"`, so every card is taller than it needs to
  be.

Result: duplicated code (maintenance hazard) and cards that are larger and
busier than the actions on them justify.

## Desired UX

- The three default agents appear in the order **PM, Engineer, Reviewer**.
- Every agent — default, custom, and team — is rendered by the **same card
  structure**, driven by a `v-for` over that section's agents, so there is
  exactly one implementation of the card somewhere in the code.
- "Add skills to agent" is a quiet, low-emphasis control (small/ghost or
  icon-only button) that still opens the skills modal.
- Selected skills display **inline to the right of the add-skills button on
  the same line** — no separate summary row stacking cards taller.
- The ⓘ help hint no longer takes a full line — at most a tooltip/short
  inline note.
- Instructions are **collapsed by default**: a compact header (label +
  dictate control + expand affordance), and the textarea only appears when
  the user expands the field.
- Net effect: a collapsed card is visibly shorter — roughly one compact
  skills line and no visible instructions field until opened.

## Acceptance criteria

- [ ] The three agent panels no longer contain forked card markup: each
      section renders its agents with a single shared card (component or
      unified `v-for` structure). Section differences (editable name +
      Remove for custom, `{ team: true }` CLI options + badge text, per-agent
      instruction refs) are passed via props/emits/slots, not duplicated.
- [ ] "Default agents" lists **PM, Engineer, Reviewer** in that order
      regardless of seed/config order; other default agents (Ross, CTO) and
      their placement are unaffected.
- [ ] Add-skills control is visually quieter (small/ghost/icon) and still
      opens the existing skills modal for the right agent.
- [ ] Selected skills render inline to the right of the add-skills button on
      one line (`(a.skills ?? []).join(", ") || "No default candidates"` kept).
- [ ] The ⓘ skills help hint is at most a tooltip/short inline note, not a
      full line.
- [ ] Instructions are collapsed by default; the textarea shows only when
      expanded; expand/collapse is per agent and VoiceDictate transcription
      still works when the field is open.
- [ ] No behavior regressions: enable toggles, Coding-agent + Model control
      (including the legacy-Gemini notice), Test agent, skills modal, and
      custom-agent name editing/remove all still work.
- [ ] Existing AgentsView-mounting tests pass (e.g.
      `src/ui-app/tests/antigravity-driver.test.ts` indexes the default
      panel as `.agent-tab-panel` index 0 and asserts `.am-cli-btn` contents)
      and tests are added/updated for ordering + the new skills/instructions
      layout where practical.
- [ ] `bun run build:ui` succeeds and `repoos check` is green on the branch.

## Notes for AI

- **Main file:** `src/ui-app/src/views/AgentsView.vue`. The three duplicated
  `.agent-card` blocks live in the default panel (~lines 717–801), custom
  panel (~lines 833–925), and team panel (~lines 940–1024) — each contains
  the identical body sequence (AgentModelControl + legacy notice, Compatibility
  test, Instructions field, skills field). Extract one shared card component,
  e.g. `src/ui-app/src/components/AgentCard.vue`, and have each section `v-for`
  over its computed list rendering it.
- **Do NOT reorder the global `DEFAULT_AGENTS` seed array** in
  `src/core/config.ts`. It also seeds Ross/CTO, feeds `DEFAULT_AGENT_NAMES` and
  seeding logic, and other code/tests look entries up **by name** — fine either
  way, but perturbing it is unnecessary and risks unrelated behavior. Enforce
  display order in `AgentsView.vue` with an explicit order map for the headless
  defaults (`pm`, `engineer`, `reviewer`), preserving current relative order for
  any unknown name. Panels keep their current order and tab selectors
  (`.agent-tab-panel`, `button.tab-btn`) so existing tests stay valid.
- **Preserve per-section behavior in the shared card**, don't flatten it:
  custom cards have an editable name `Input` and a Remove button; team cards
  pass `{ team: true }` to `cliOptionsFor`; badge text differs (default/team);
  VoiceDictate writes into `defaultInstrRefs` / `customInstrRefs` maps keyed by
  agent name.
- **Instructions collapse:** per-agent expanded state (e.g. a `Set<string>` of
  open names or a `<details>` element). Keep `setInstr` / `updateAgentInstr`
  semantics and the ref-based transcription wiring.
- **Conventions (AGENTS.md):** reuse the existing skills modal (dialog content
  is already body-teleported — don't recreate it, and don't put `position:
  fixed` overlays outside a Teleport); use the global `ui/dialog/*` and `style.css`
  form classes if any new control is needed; run `bun run fmt` and
  `bun run build:ui` after editing the SFC so the worktree build is fresh.
- **Assumption:** "minimise the lines" targets the two most stacked areas —
  the skills field and the instructions field. The Coding-agent + Model and
  Compatibility rows keep their current one-row layout unless trivially
  combinable; don't redesign unrelated rows.
- Do not auto-request a preview to verify the change; previews are
  requested by the human only.

## Scope

- **In:** Agents page only (`AgentsView.vue` + new shared card component +
  its tests). Deduplication, default-agent display order, skills-row
  relayout, instructions collapse.
- **Deferred:** the skills modal itself, the `BuiltInAgentCard` components,
  and any server-side config/API changes. Custom and team agent *ordering*
  beyond keeping their sections intact.

## Original prompt

I noticed that the 3 default agents (pm, engineer, reviewer)  have triplicate html in the code, but since they're all the same can't we do a `v-for` and just re-use the same card structure for each? also I'd like to re-order it to PM, Engineer, Reviewer (because the current ordering confuses me). Also the "Add skills to agent" button is too large and obvious, it's like the least important button on the agent card, so please make it less distracting, and please put the selected skills to the right of the add skills button (I don't want the card to be unnecessarily large, so better to minimise the lines. also let's keep the instructions minimised and only show the text area field if the user expands it. Those uiux and code changes should make this page a lot easier for users and for code maintainability.

## Screenshots

![Screenshot-2026-09-25-at-12.55.13](/api/tasks/0500/attachments/screenshot-1.png)

## Activity

- 2026-09-25T06:04:32Z · created · hello@repoos.org
- 2026-09-25T06:04:33Z · screenshots
- 2026-09-25T06:06:14Z · status draft→inbox, title, area, type, body
- 2026-09-25T06:10:03Z · status inbox→ready
- 2026-09-25T06:11:38Z · status ready→active, branch
- 2026-09-25T06:15:47Z · status active→review

