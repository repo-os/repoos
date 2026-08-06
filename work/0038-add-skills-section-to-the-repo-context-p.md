---
id: "0038"
title: Add skills section to the Repo Context page
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/0038-skills-section
created_at: "2026-08-06T09:35:00Z"
updated_at: "2026-08-06T09:56:09Z"
---
## Activity

- 2026-08-06T09:35:00Z · created · unknown
- 2026-08-06T09:49:33Z · status inbox→ready
- 2026-08-06T09:49:34Z · status ready→active
- 2026-08-06T09:56:09Z · status active→review · implementation on feat/0038-skills-section (a71bac9)

## Problem

The Repo Context page is the single place where AI-readable knowledge lives —
today it browses `docs/` (concepts, ADRs, architecture). But procedural
knowledge is missing. An agent working this repo has no way to discover *how* a
specific kind of task should be done — the review checklist, the release
routine, the commit-message convention — short of reading every doc. Docs are
*reference* material; skills are *procedures* ("how to do a specific kind of
task"), meant to be loaded on demand. Neither the UI nor the repo has a place
for them, so teams either bury procedures in docs or skip them entirely.

## Desired UX

The Repo Context page gains a second, clearly-labeled section alongside docs.

- **Skills section** lists the repo's skills — markdown files with frontmatter
  (`name`, `description`), stored under a `skills/` directory at the repo root,
  following the opencode skill convention (`skills/<name>/SKILL.md`).
- Each skill row shows its name and description; clicking it opens the skill
  body in the existing content viewer, exactly like a doc.
- The section is visually distinct from docs (e.g. a different icon + section
  header, or a filter tab) so "reference" vs "procedure" reads at a glance.
- Zero skills → the section shows a friendly empty state, not an error.

## Acceptance criteria

- [ ] A new **Skills** section appears on the Repo Context page, next to docs
- [ ] Skills are read from a `skills/` dir at the repo root, one folder per
      skill (`skills/<name>/SKILL.md`), and the page lists each skill's name +
      description from frontmatter
- [ ] Clicking a skill opens its body in the content viewer (same read/browse
      pattern as docs)
- [ ] The section renders an empty state when `skills/` has no skills, and
      degrades gracefully if a skill file is missing/malformed frontmatter
      (skips it — never breaks the page)
- [ ] The repo ships at least one example skill so the feature is visible
      out of the box
- [ ] `repoos check` passes

## Notes for AI

- **Format**: align with the opencode skill convention so skills are loadable
  by coding agents too — `skills/<name>/SKILL.md` with frontmatter
  `name` + `description`, body = the procedure/instructions. The UI only needs
  name, description, and body; keep the rest of the file untouched.
- **Server**: mirror the docs path — add a `skillsDir` config key (default
  `skills`, like `docsDir` default `docs`) in `src/core/config.ts`, a
  `listSkills` in the same module that discovers skills, and a
  `GET /api/skills` route next to `GET /api/docs` in `src/server/server.ts`.
- **UI**: extend the docs store (`src/ui-app/src/stores/docs.ts`) or add a
  sibling store; extend `ContextView.vue` with the skills section reusing the
  existing doc-row / content-viewer markup. Keep the two sections visually
  distinct (icon + header, or a docs/skills filter tab).
- **SELF-HOSTING RULE**: this repo runs itself. Malformed frontmatter, missing
  `name`, or an empty `skills/` dir must never break the page or the API — parse
  defensively, skip bad files, return an empty list.
- **Zero runtime dependencies**: no markdown parser to add — reading the first
  lines of frontmatter with plain string ops is enough.
- **Don't**: don't build skill *authoring* (editing, uploading), don't wire
  skills into agent launches yet (that's a follow-up), don't move/reformat docs.

## Scope

- **This task**: skills directory convention, config key, `/api/skills` read
  path, the Skills section on the Context page, one example skill.
- **Defer to a SEPARATE task**: authoring/editing skills in the UI, associating
  skills with agents on the Agents page, injecting skills into running agents
  (`#0037`'s launch mechanics are the natural place), search/filtering.

## Related

- The Context page (`ContextView.vue` + docs store + `/api/docs`) is the
  pattern this mirrors. `#0037` builds agent launch mechanics that a future
  skill-injection task would hook into; the Agents page (`#0035`) is where
  per-agent skill assignment would surface later.
