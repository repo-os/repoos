---
updated_at: "2026-09-30T02:08:22Z"
review_passes: 1
id: "0590"
title: Add Cut Next shortcut and cache AI release notes in release modal
type: feature
status: review
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "✗ Server finalization stopped at check: server-side finalization timed out (deadline exceeded). The same worktree can be resumed and retried."
priority: p2
area: [web, server]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-cut-next-shortcut-and-cache-ai-relea
model_override: opencode-go/mimo-v2.6-flash
review_model_override: opencode-go/glm-5.3-flash
created_at: "2026-09-29T23:25:13Z"
last_check_failure: "repoos check at 2026-09-30T00:46:04.758Z: server-side finalization timed out (deadline exceeded)"
dev_error_count: 1
---
## Problem

The **Cut a release** modal (`ReleasesView.vue`) requires typing a semver into **New version** before **Publish** is enabled (`newVersionValid` is false until the field is filled), even though **Suggested next** is already shown in the modal facts. That extra typing is friction for the common case of cutting the next patch release.

Operators still need the free-text field for non-default versions (prerelease channels such as `-beta`, `-canary`, `-rc`, or other special cases).

Separately, **Generate with AI** for release notes runs a one-shot agent call that can take one to two minutes (`POST` draft endpoint in `src/server/routes/release.ts`, commits from `collectReleaseCommits` in `src/server/release.ts`). When the release cut fails later (for example `repoos check` during the cut flow) and the operator retries without new commits on `HEAD`, they must wait for a full regeneration even though the commit range and notes content would be the same.

## Desired UX

### Version field: optional **Cut Next**

Keep the existing **New version** input, live tag preview (`→ v…`), and prerelease hints unchanged for manual entry.

To the right of that row (same visual band as the input and `→` tag preview), add an explicit alternative path labeled along the lines of:

`[ input ] → v0.5.59` **OR** `[ Cut Next ]`

- **Cut Next** applies the same version as **Suggested next** (the value already computed via `suggestedVersion` / `nextReleaseVersion` in `src/ui-app/src/releases.ts`) so the operator can publish the standard next release without typing.
- Manual typing remains the path for rc/canary/beta and any other custom semver; **Cut Next** must not block or replace that workflow.
- After **Cut Next**, **Publish** behaves as if the operator had typed that suggested version (correct tag prefix, prerelease vs stable rules unchanged).

Copy and layout should follow existing release-modal patterns (shared `Button`, `field` / `rel-*` classes in `ReleasesView.vue` / `style.css` — no raw unstyled controls).

### AI release notes: disk cache keyed by commit

When AI release notes are successfully generated, persist them under the repo’s derived cache (default `cacheDir` / `.repoos`, gitignored derived state — not task files or git).

When the operator clicks **Generate with AI** again (or the server handles an equivalent draft request), **before** invoking the agent:

1. Resolve the current release-notes commit context (at minimum `HEAD` full SHA; assume this is sufficient when “the commit hasn’t changed” — document if you also key on `sinceTag` or commit-range identity to avoid stale notes after a new tag lands without moving `HEAD`).
2. If a cached entry exists for that key, return the stored notes immediately (no LLM call, no multi-minute wait).
3. If not, run the existing agent flow, then write the result to cache on success.

The modal should surface cache hits in a lightweight way (for example instant fill with a short hint that notes were reused, or reuse silently with no error) so retries after a failed cut feel fast. Editing the textarea after load remains the operator’s choice; cache is for avoiding redundant generation, not for locking content.

Failed or empty agent runs must not overwrite a good cached entry.

## Acceptance criteria

- [ ] **Cut a release** modal shows **OR** and a **Cut Next** control beside the version input / tag preview row as described above.
- [ ] **Cut Next** sets the release version to **Suggested next** and enables **Publish** when that version is valid (not equal to published / not colliding with existing tag rules already enforced by `newVersionValid`).
- [ ] Manual semver entry (including `-beta`, `-canary`, `-rc`, etc.) still works unchanged; **Cut Next** is optional, not mandatory.
- [ ] Successful AI-drafted release notes are written to derived cache under the configured `cacheDir` (e.g. `.repoos/`), not committed to git.
- [ ] A subsequent **Generate with AI** request with the same cache key (per **Notes for AI**) returns cached notes without calling the agent.
- [ ] Cache lookup happens on the server draft endpoint; UI still drops returned text into the optional notes field as today.
- [ ] Tests cover **Cut Next** enabling publish with suggested version and cache hit vs miss on the release-notes draft path (extend or add beside `src/ui-app/tests/release-status.test.ts` / server release tests as appropriate).
- [ ] If user-facing behavior or storage location is non-obvious, update `user-docs/` in the same change; scoped doc check per AGENTS.md definition of done.

## Notes for AI

- Primary UI: `src/ui-app/src/views/ReleasesView.vue` (modal fields ~750–809, `openConfirm` clears `newVersion` today — ensure **Cut Next** still works on reopen).
- Version suggestion: `suggestedVersion`, `nextReleaseVersion` in `src/ui-app/src/releases.ts`.
- AI draft API: `generateReleaseNotes` in `src/server/routes/release.ts`; commit collection in `collectReleaseCommits` in `src/server/release.ts`.
- Use `config.cacheDir` (see `user-docs/configuration.md`) for cache files; keep paths stable and safe to delete.
- **Cache key assumption:** index by full `HEAD` SHA at draft time unless you find a case where `sinceTag` changes with the same `HEAD` and would produce different notes — if so, compound the key (document in code comment).
- **LLM usage rule:** cache hits must not call `runPrompt` or double-count sessions; misses still call `recordOneShotSession` as today.
- Rebuild UI after changes (`bun run build:ui` or full build); run `bun run fmt` and scoped `repoos check --changed main` before review.
- Do not remove the version input or require AI notes for every release.
- Do not add runtime dependencies.

## Scope

**In scope:** Release modal **Cut Next** UX; server-side persistence and lookup for AI-generated release notes on regenerate; tests and minimal docs.

**Out of scope:** Changing semver suggestion logic beyond wiring **Cut Next** to existing `suggestedVersion`; caching edited operator text after they change the textarea; cloud sync of notes; automatic pre-generation on modal open without clicking **Generate with AI** (unless trivial once server cache exists — prefer explicit generate + cache hit).

## Related

- Release notes AI drafting (#0361 area — `generateReleaseNotes`, `release-status.test.ts`).
- `nextReleaseVersion` / **Suggested next** in the Releases view.

## Original prompt

It's annoying to always have to type the new version, but it is helpful to have that input field in case the user wants to cut a special case or rc/canary/beta. so to the right of it let's add a button that says OR [Cut Next]. For example: [ input ] -> v0.5.59 OR [Cut Next]. Also while we're on this modal, is it possible to save any AI generated release notes so if a release fails checks for some reason and we need to run it again we don't need to wait another few minutes for the AI to generate new release notes if the commit hasn't changed? e.g. it saves each AI release notes generated on disk somewhere, maybe in a json in .repoos/ or wherever you think is appropriate, so if someone needs to click generate AI release notes again for any reason we look it up first at that commit ID and see if it already exists to save time.

## Screenshots

![Screenshot-2026-09-30-at-07.12.27](/api/tasks/0590/attachments/screenshot-1.png)

## Activity

- 2026-09-29T23:25:13Z · created · hello@repoos.org
- 2026-09-29T23:25:13Z · screenshots
- 2026-09-29T23:25:50Z · status draft→inbox, title, area, body
- 2026-09-29T23:26:16Z · status inbox→ready
- 2026-09-30T00:03:21Z · model_override
- 2026-09-30T00:03:25Z · review_model_override
- 2026-09-30T00:03:27Z · status ready→active, branch
- 2026-09-30T01:47:11Z · agent exited with an error (opencode) · ✗ Server finalization stopped at check: server-side finalization timed out (deadline exceeded). The same worktree can be resumed and retried.
- 2026-09-30T01:58:37Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-30T02:03:56Z · status active→review

