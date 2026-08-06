---
id: "0035"
title: Add Agents page for configuring AI coding agents
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/0035-agents-page
created_at: "2026-08-06T08:43:16Z"
updated_at: "2026-08-06T09:22:00Z"
---
## Activity

- 2026-08-06T08:43:16Z · created · unknown
- 2026-08-06T09:00:00Z · spec fleshed out: defaults + custom agents, coding
  agent + model per agent, on/off toggles · ai
- 2026-08-06T09:00:00Z · status inbox→ready
- 2026-08-06T08:51:11Z · status ready→active
- 2026-08-06T09:22:00Z · status active→review · implementation on feat/0035-agents-page (2d36515)

## Problem

RepoOS's roadmap is AI-assisted, but there is no place to define *which* AI
coding agent performs which role. Every agent/assistant today falls back to
whatever the user launched (opencode, Claude Code, …) with its default model.
Teams want distinct roles — engineer, reviewer, pm — plus custom specialties
(data analyst, refactor agent, …), each pinned to a specific coding agent and
model (big pickle, deepseek v4, or the coding agent's default). None of this is
configurable or visible anywhere today.

## Desired UX

A new **Agents** page in the app nav (alongside Dashboard / Work / Docs /
Settings) that lists the AI agents the repo knows about.

- **Two sections**: *Default agents* (engineer, reviewer, pm — always present,
  seeded at runtime) and *Custom agents* (data analyst, refactor agent, … —
  user-created).
- **Each agent** shows: name, an on/off toggle, a coding-agent select, and a
  model select.
  - Coding agent select: `opencode` | `claude code` — **opencode is the default**.
  - Model select: `default` | `big pickle` | `deepseek v4` — **big pickle is the
    default**; "default" means the coding agent's own default.
- **Toggles**: agents are optional. A toggled-off agent renders as inactive and
  is not used; the toggle is per-agent and independent.
- **Custom agents**: an "Add agent" affordance (name + coding agent + model)
  creates a row in the custom section; custom agents can be renamed, tuned, and
  removed. Default agents are seeded but otherwise behave the same (they can be
  toggled and tuned, not removed).
- **Persistence**: changes survive a reload, written back through the existing
  config write path.

## Acceptance criteria

- [ ] New **Agents** page reachable from the app nav
- [ ] Default agents seeded at runtime: engineer, reviewer, pm — each `opencode`
      + `big pickle`, on by default, and present even with a fresh config
- [ ] Custom agents can be added (e.g. data analyst, refactor agent) with name,
      coding agent, and model; added agents persist across a reload
- [ ] Every agent has an on/off toggle; toggled-off agents render as inactive
      and their setting persists
- [ ] Coding-agent select offers `opencode` and `claude code`, defaulting to
      `opencode`
- [ ] Model select offers `default`, `big pickle`, and `deepseek v4`, defaulting
      to `big pickle`
- [ ] Custom agents can be removed; removing one persists and clears it from the
      list on reload
- [ ] `repoos check` passes

## Notes for AI

- **Storage**: reuse the existing config path (`GET`/`PATCH /api/config` in
  `src/server/server.ts` + `repoos.toml`, schema in `src/core/config.ts`). Most
  likely an `agents` array section in the config schema. SELF-HOSTING RULE: this
  repo runs itself — malformed agent config must never break `repoos` startup;
  parse defensively and fall back to defaults.
- **Defaults are runtime, not file**: engineer/reviewer/pm + opencode/big pickle
  must be produced when the config section is absent. Only write to
  `repoos.toml` when the user actually edits an agent — a fresh repo should show
  the defaults without config noise.
- **UI**: wire a new route + nav entry mirroring how Settings/Work pages are set
  up in `src/ui-app/src/router` and the nav component. Reuse existing primitives
  (`Select`, `Button`, `Input`); use a switch-style toggle consistent with the
  existing settings UI.
- **Model list**: `default`, `big pickle`, `deepseek v4` — keep it an
  extensible, ordered list shared with the per-agent selects.
- **Identity**: an agent's name is its key (defaults are fixed names; custom
  names must be unique and non-empty).

## Scope

- **This task**: the Agents page, default + custom CRUD, per-agent toggles,
  coding agent + model selects, persistence, runtime defaults.
- **Defer to a SEPARATE task**: assigning agents to specific tasks, invoking the
  coding agents from the UI, per-agent parameters beyond model (temperature,
  context budget), per-task agent overrides.

## Related

- 0006 / 0013 established the settings + config-edit path this builds on; the
  Agents page is the next layer of the same story.
