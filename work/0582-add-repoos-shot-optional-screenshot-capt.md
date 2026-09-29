---
id: "0582"
title: "Add repoos shot: optional screenshot capture of a task preview"
type: feature
status: inbox
priority: p2
area: cli
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-29T11:13:18Z"
updated_at: "2026-09-29T11:24:34Z"
---
## Problem

Engineers verify UI changes with whatever screenshot tool their own harness offers. On #0581 that tool lagged and the engineer fell back to checking the tooltip copy as text, so visual layout went unverified. Nothing captures visual evidence in a form the reviewer or human can see: a UI task ends with a diff plus "it looked fine".

A second issue on #0581: the preview resolved to the default target when it should have been the docs site. Preview routing matches the task's `area` against `[[preview.targets]].areas` (`src/server/preview.ts`, `previewCandidates`), and `area` is set up front by the PM agent or an outside spec author, before anyone knows which files change. So a wrong area means a preview (and any screenshot) of the wrong app, silently.

## Goal

A small, optional, harness-independent way to capture screenshots of a task's managed preview, show them to the human in the task drawer, and make target/area mismatches visible.

## Design

### `repoos shot`

- `repoos shot [<route|url>] [--target <name>] [--selector <css>]` — CLI command, not core engine. URL/route in, PNG out. No knowledge of Vue, Storybook or any UI stack. Component-level capture stays a project-side script.
- Reuse the optional Playwright/WebKit path the UI smoke test already uses. Optional dev dependency only; when missing, print install advice and exit non-zero with a clear "skipped" message. No new runtime dependency (zero-runtime-deps rule).
- Runs against the task's managed preview via the server (same mechanism as `::repoos-preview-request::`); never runs `repoos serve` itself.
- **Target from the diff, not from `area`.** Add an optional `paths` glob list to `[[preview.targets]]` (e.g. `user-docs/**` for the docs site, `landing/**` for the landing page). `repoos shot` runs `git diff main...HEAD --name-only`, matches changed files against those globs, and captures one shot per matching target. `--target` overrides. When nothing matches, fall back to the area-based resolution. Print and store the resolved target name(s) with each shot.
- New `repoos.toml` key (`paths`): needs a Settings UI control in the same change, or a documented reason it stays TOML-only.

### Storage (never in git)

- Shots are written to a **separate** location from the spec screenshots, e.g. `work/.attachments/<taskId>/shots/`, so they never mix with the user-uploaded screenshots that are referenced from the task body's `## Screenshots` section. Do not edit the task `.md` to reference them; the server lists them from disk.
- That tree is already gitignored (`work/.attachments/` in `.gitignore`) and `repoos check`'s task-asset guard fails the gate on any tracked image under it. Verify with a test that a captured shot does not appear in `git status`.
- Local-only for now. Persistent cloud image URLs are a later, separate option; keep the storage behind one small interface so that can be added without touching callers.

### Showing them to the human

- Task drawer, **Changes** tab: a new "UI changes" section **above** "Code changes", shown only when the task has shots. Small thumbnails with the target name as caption.
- Reuse the existing viewer: `ScreenshotViewer.vue` for the click-to-enlarge modal and `ScreenshotExpandButton.vue` for the expand control, the same components the new-task/new-input screenshots use. Add a third viewer instance in `TaskDrawer.vue` (`pendingViewer*` / `pmViewer*` are the existing pattern). Serve thumbnails and full images through a new route next to `GET /api/tasks/:id/attachments/:file`.
- Reviewer agent prompt: mention that the shots exist and can be read alongside the diff. The reviewer stays read-only.

### Area/target mismatch warning

- When the changed paths match a preview target that the task's `area` does not resolve to, show a small warning in the drawer (near the preview control and in the Changes tab): "This task's changes touch <target> but its area is <area>." The human can then pick the right target from the existing preview target dropdown. Warning only; nothing is changed automatically.
- Note: `area` is a single free-text string, not a list. `previewCandidates` compares the whole string, case-insensitively, against each target's `areas`. Some tasks already write `area: web + core + server`, which matches no target today (nothing parses it). Decide whether to split multi-area values (on `+` and `,`) as part of this task; if so, do it in one shared helper used by both preview routing and the warning, and add a test.

## Who runs it

- **Engineer**: once, at the end of a UI-visible change, before handoff (not before every `repoos check`). Skipped for non-UI changes. If the shot fails or the tool is unavailable, fall back to text verification and say so in the handoff.
- **Reviewer**: reads the shots alongside the diff. May re-run, but stays read-only.
- Add a short rule to AGENTS.md reconciling this with "previews are on request, not routine": a screenshot capture is the one sanctioned use of the managed preview by the engineer, for UI-visible changes only.

## Follow-up (not this task)

Use the same `paths` map so a human clicking Preview on a mislabeled task gets the right default target, instead of only being warned.

## Out of scope

Visual-regression baselines, image diffing, per-component harnesses, any hosted service, cloud image URLs.

## Acceptance criteria

- [ ] `repoos shot` captures PNGs from the task's managed preview and writes them under `work/.attachments/<taskId>/shots/`.
- [ ] Targets are chosen from changed paths via `paths` globs; `--target` overrides; area is the fallback; resolved target names are printed and stored.
- [ ] Missing Playwright/browser gives a clear skip message with install advice, not a crash.
- [ ] No new runtime dependency; captured shots are never tracked by git and the task-asset guard still passes.
- [ ] Changes tab shows a "UI changes" section above "Code changes" with small thumbnails that open in the existing screenshot viewer modal; hidden when there are no shots.
- [ ] Mismatch between changed-path targets and the task's area shows a warning; the human can switch via the preview target dropdown.
- [ ] `paths` has a Settings UI control (or a documented TOML-only exception); AGENTS.md and `user-docs/` updated.
- [ ] Tests cover path-to-target resolution, multi-target diffs, the missing-browser path, the mismatch warning and the git-ignored storage location.

## Activity

- 2026-09-29T11:13:18Z · created · unknown
- 2026-09-29T11:24:34Z · body
