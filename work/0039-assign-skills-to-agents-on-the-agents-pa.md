---
id: "0039"
title: Assign skills to agents on the Agents page
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-06T10:05:00Z"
updated_at: "2026-08-11T17:34:28Z"
---
## Problem

Skills exist on the Context page (`skills/<name>/SKILL.md`) and the Agents page
defines who works (`engineer`, `reviewer`, `pm` — each with a coding agent,
model, and instructions). But nothing connects them: an agent launched to work a
task has no way to know which procedures it may load, and there is no per-agent
concept of "this role knows these skills". Every agent is implicitly expected
to use every skill — or none. The capability boundary ("who may use which
skill") doesn't exist, so skills can't be gated per role and a launched agent
has no curated skill set.

## Desired UX

On the **Agents page**, each agent card (default and custom) gains a **Skills**
multi-select: the repo's discovered skills, each toggleable on/off per agent.

- Selecting a skill for an agent means "this agent may load it"; a skill with
  nothing selected means the agent uses no skills.
- The choice is persisted with the rest of the agent's config and survives a
  reload.
- When an agent is launched to work a task (`#0037`'s start-work), the body of
  every skill enabled for that agent is injected into the agent's launch
  context (in addition to the agent's instructions), so the agent can follow
  those procedures.
- Skills are discovered from the existing skills read path (`#0038`), so newly
  added skills appear automatically.

## Acceptance criteria

- [ ] Each agent card on the Agents page shows a Skills multi-select listing the
      repo's discovered skills
- [ ] Skills can be toggled per agent (multi-select, none allowed); the choice
      persists through a reload and is round-tripped through the config API
- [ ] The `Agent` config gains a `skills` field (array of skill names),
      validated like the other agent fields (strings; unknown names are ignored
      or surfaced, never fatal)
- [ ] When an agent is launched (`#0037`), the contents of its enabled skills
      are included in the agent's launch context alongside its instructions
- [ ] New skills added to `skills/` appear in the per-agent pickers without a
      server restart (shared discovery with the Context page)
- [ ] `repoos check` passes

## Notes for AI

- **Dependencies**: `#0035` (Agents page + agent config), `#0038` (skills
  discovery), and `#0037` (start-work launch mechanics) are complete. Build on
  their current APIs rather than retaining the old conditional/stub guidance.
- Coordinate context assembly with active task 0097. Skill contents should be
  referenced by, or included in, the same cached context-pack mechanism rather
  than creating a second unbounded prompt-concatenation path.
- **Config**: extend `Agent` in `src/core/types.ts` + UI mirror with
  `skills?: string[]`. The server agents PATCH validation in
  `src/server/server.ts` already validates agents — add skills validation
  there (must be an array of strings if present). Serialization goes through
  the existing `[[agents]]` TOML path — array field inside the table just
  works with `serializeTomlVal`.
- **Discovery**: reuse `listSkills` (`GET /api/skills` from `#0038`) for the
  picker options; serve the skill names alongside `agentsMeta` on
  `/api/config` so the Agents page has one round-trip.
- **Injection**: at launch, read each enabled skill's `SKILL.md` (same
  read path the Context page uses) and concatenate into the agent's mission
  context. Keep it additive — agent `instructions` first, then skills.
- **SELF-HOSTING RULE**: this repo runs itself. A skill name in an agent's
  list that no longer exists on disk must not break startup, the API, or the
  page — drop unknown names defensively at load/injection time.
- **Don't**: don't build skill authoring, don't add per-task skill overrides
  (that's a later layer), don't make skills mutually exclusive or required.

## Scope

- **This task**: per-agent skills multi-select + persistence on the Agents
  page, `skills` field on agent config + validation, skill-name discovery on
  `/api/config`, skill injection into the `#0037` launch context.
- **Defer to a SEPARATE task**: skill authoring/editing, per-task skill
  overrides, skill "versions", running a skill as an agent itself.

## Related

- `#0035` built the Agents page + agent config this extends; `#0038` built the
  skills read path this picks from; `#0037` provides the launch mechanics where
  injection happens.
- `#0097` adds cached launch context packs; land skill injection against that
  contract after it stabilizes.

## Activity

- 2026-08-06T10:05:00Z · created · unknown
- 2026-08-11T12:00:01Z · status inbox→draft
- 2026-08-11T15:37:46Z · updated · remove completed dependency caveats and coordinate with context packs
- 2026-08-11T17:33:50Z · status draft→inbox
- 2026-08-11T17:33:56Z · status inbox→draft
- 2026-08-11T17:34:02Z · status draft→inbox
- 2026-08-11T17:34:24Z · status inbox→ready
- 2026-08-11T17:34:28Z · status ready→inbox
