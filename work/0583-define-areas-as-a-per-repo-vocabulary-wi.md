---
id: "0583"
title: Define areas as a per-repo vocabulary with a multi-select picker
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
model_override: opencode-go/glm-5.3-flash
review_model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-29T11:31:44Z"
updated_at: "2026-09-29T16:47:22Z"
---
## Problem

`area` is a free-text string typed into a plain input (task drawer, new task, PM/agent-authored specs). Nothing defines what areas exist, so values drift: the board currently has `web`, `ui`, `ui-app`, `server`, `server + ui-app`, `web + core + server`, `general`, and so on. Preview routing (`[[preview.targets]].areas` in `src/server/preview.ts`) compares the whole string, so a misspelled or multi-value area silently matches no target and a task gets the wrong preview. See #0582 for the screenshot feature that makes this visible.

## Goal

Areas become a defined, per-repo vocabulary that users and agents pick from, with free text still allowed.

## Design

- **Source of the vocabulary.** A declared list in `repoos.toml` (e.g. `[areas]` with names and optional descriptions), merged with every `areas` value declared by `[[preview.targets]]`, so a repo that has only set up previews already gets sensible options. Repos with nothing declared show only the free-text entry.
- **Multi-value: comma-separated, stored as a list if the parser allows.**
  - First step: check whether the task frontmatter parser (`src/core/task.ts`) supports list values. It is zero-dependency and may be hand-rolled.
  - If it does, store `area: [web, core]`. If not, store a comma-separated string (`area: web, core`) and parse it with one shared helper. Either way, there is one canonical written form and it uses commas, never `+`.
  - Display: one chip per area in the UI (matching the multi-select); `web, core` in plain text (`repoos list`, `show`, logs). CLI and API take `--area web,core`.
  - Legacy: the reader accepts both `+` and `,` so existing `a + b` tasks keep working until the migration rewrites them.
  - This is a task-format change, so per AGENTS.md ("self-modifying act") it needs a migration in the same change and a check that the parser still reads every existing file in `work/`. Preview routing, the board filter and search must all use the one shared parse helper.
- **UI.** A multi-select dropdown in the same style as the existing custom dropdowns (`ui/select/*`, no native `<select>`), with checkmarks like the Story dropdown, plus a free-text entry that adds a new area. Used in the task drawer and in New task. Newly typed areas that are not in the vocabulary are allowed, and can be offered "add to repoos areas".
- **Agents.** The PM/task-authoring prompt receives the area list and must choose from it (or propose a new one explicitly), so outside-authored specs stop inventing values. Agents still never edit task frontmatter directly; changes go through `repoos update --area` / the API, which accept multiple values.
- **Onboarding.** `repoos init` and the first-run flow prompt the user to define areas and preview targets together, since they reinforce each other. Skipping is fine; the free-text fallback remains.
- **Periodic refresh.** When a preview target or `[areas]` entry is added or removed, surface tasks whose areas no longer resolve (a small warning, not a hard error). Optionally a periodic audit task, in the same spirit as the docs-staleness sweep in AGENTS.md.
- **Settings.** The `[areas]` key needs a Settings UI control (AGENTS.md rule for user-facing `repoos.toml` settings), plus a test.

## Relationship to #0582

#0582 warns when changed paths and the task's area disagree, and picks screenshot targets from diffs. It can land first using a minimal shared split helper for existing `a + b` values. This task replaces that helper with the real multi-value model and the vocabulary.

## Out of scope

Automatically inferring areas from changed paths (#0582's `paths` globs cover the preview case), renaming existing areas repo-wide beyond a one-time migration, area-based permissions.

## Acceptance criteria

- [ ] `repoos.toml` can declare areas; the effective vocabulary is those plus all preview-target areas.
- [ ] Parser list support is checked first and the stored form chosen accordingly (list, else comma string); the written form always uses commas.
- [ ] Tasks support multiple areas; the reader accepts legacy `a + b`; a migration rewrites existing values and every file in `work/` still parses.
- [ ] UI shows one chip per area; plain-text output shows `a, b`; CLI/API accept `--area a,b`.
- [ ] Area picker is a multi-select in the shared dropdown style with a free-text entry; with no vocabulary configured it degrades to free text only.
- [ ] `repoos update --area` and the task API accept multiple areas; the PM agent prompt includes the vocabulary.
- [ ] Preview routing, board filters and search use the shared parse helper; a multi-area task resolves to the matching target(s).
- [ ] Onboarding prompts for areas/previews and can be skipped; Settings UI control for `[areas]`.
- [ ] Tests cover the migration, multi-value parsing, vocabulary merge, and the free-text-only fallback; docs in `user-docs/` and AGENTS.md updated.

## Activity

- 2026-09-29T11:31:44Z · created · unknown
- 2026-09-29T11:34:50Z · body
- 2026-09-29T11:34:57Z · status inbox→ready
- 2026-09-29T16:47:18Z · model_override
- 2026-09-29T16:47:22Z · review_model_override
