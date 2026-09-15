---
id: "0361"
title: Add optional AI-draftable release notes when cutting a release
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-optional-ai-draftable-release-notes-
review_model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-09-15T19:22:15Z"
updated_at: "2026-09-15T19:53:02Z"
review_rounds: 1
review_passes: 1
---
## Problem

Cutting a release from the Releases page ships a version with no way to
attach human-readable notes describing what's in it. The person cutting the
release has to remember what changed and write notes somewhere else after the
fact — so in practice releases go out with no summary at all. There's also
easy low-effort value being left on the table: the commits since the last
release are sitting right there in git, and drafting notes from them is
exactly the kind of chore an LLM can do in one shot.

## Desired UX

When the human opens the "Cut a release" modal on the Releases page, there is
an **optional release-notes text area**. Two ways to fill it:

1. **Type it.** Write notes by hand in the text area before confirming the cut.
2. **Generate it.** Click a button ("Generate with AI") that drafts release
   notes from the git commits since the last release and fills the text area
   with the draft.

The generated draft lands in the same text area, so the human can review and
edit it before cutting. The field stays optional end to end — cutting a
release with the notes left empty works exactly as it does today.

## Acceptance criteria

- [ ] The "Cut a release" modal includes an optional release-notes text area.
- [ ] A release can be cut with notes left empty — no regression to the existing flow.
- [ ] Typed notes are submitted with the cut and end up on the published release (assumed: as the GitHub release body — see Notes).
- [ ] A "Generate with AI" button fills the text area with draft notes based on the git commits since the last release.
- [ ] The generated draft is editable in the text area before the cut is confirmed; nothing is cut automatically by generation.
- [ ] Generation still works sensibly when no previous release exists (e.g. drafts from all history) — stated assumption, see Notes.
- [ ] If generation fails, the modal shows an error, any typed text is preserved, and the cut can still proceed.
- [ ] The AI generation call records its usage in the `sessions` table (house rule: every LLM call site).
- [ ] `repoos check` passes.

## Notes for AI

- The flow lives in the "Cut a release" modal in `src/ui-app/src/views/ReleasesView.vue`, which POSTs to `/api/release`; the server route is under `src/server/routes/`. Modal/dialog CSS goes in `src/ui-app/src/style.css`, not the view's `<style scoped>` block (dialogs are body-teleported).
- Use the repo's existing LLM plumbing for the generate action (`runPrompt` / `AgentRunner` in `src/server/agents.ts`) — **zero runtime dependencies is a hard constraint**, do not add an SDK. It's a one-shot call, so it must call `recordOneShotSession(...)` immediately after the await.
- Keep the field optional; never block or gate the existing cut flow on notes.
- Stated assumptions (reasonable defaults the user did not specify):
  - Commit range = commits since the last release tag; fallback to the full history when no previous release exists.
  - Notes are published as the GitHub release body when a GitHub release is cut; stored with the release record otherwise.
  - One generate action that fills the textarea — no streaming preview, no regeneration history.
- After any UI change, rebuild (`bun run build:ui`). Do not request a preview as part of finishing — previews are on request from the human.

## Scope

In scope: the optional notes text area + AI-generate button in the Releases page cut flow, carrying notes through the existing release flow.

Deferred: editing or appending notes to an already-cut release, notes for releases cut via CLI/API, markdown preview rendering, changelog-format conventions or per-task grouping rules.

## Original prompt

I think it would be fun to have a release notes option when cutting a new release from the Releases page. This could be an optional text area field, or you could have a button for AI to generate release notes for you based on the git commits since the last release.

## Activity

- 2026-09-15T19:22:15Z · created · hello@repoos.org
- 2026-09-15T19:23:28Z · status draft→inbox, title, area, body
- 2026-09-15T19:24:14Z · status inbox→ready
- 2026-09-15T19:24:22Z · status ready→active, branch
- 2026-09-15T19:35:12Z · status active→review
- 2026-09-15T19:37:54Z · needs_input
- 2026-09-15T19:38:07Z · review_model_override
- 2026-09-15T19:44:25Z · needs_input
- 2026-09-15T19:44:25Z · status review→active
- 2026-09-15T19:53:02Z · status active→review
