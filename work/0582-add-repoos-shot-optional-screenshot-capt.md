---
id: "0582"
title: "Add repoos shot: optional screenshot capture of a task preview"
type: feature
status: inbox
priority: p2
area: cli
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-29T11:13:18Z"
updated_at: "2026-09-29T11:13:18Z"
---
## Problem

Engineers verify UI changes with whatever screenshot tool their own harness offers. On #0581 that tool lagged and the engineer fell back to checking the tooltip copy as text, so visual layout went unverified. Nothing captures visual evidence in a form the reviewer or human can see: a UI task ends with a diff plus "it looked fine". A second issue on #0581: the preview resolved to the default target when it should have been `docs-site`, so any screenshot would have been of the wrong app.

## Goal

A small, optional, harness-independent way to capture a screenshot of a task's managed preview and attach it to the task.

## Design

- `repoos shot [<route|url>] [--target <name>] [--selector <css>] [--out <file>]` — CLI command, not core engine. URL/route in, PNG out. No knowledge of Vue, Storybook or any UI stack. Component-level capture stays a project-side script.
- Reuse the optional Playwright/WebKit path the UI smoke test already uses. Optional dev dependency only; when missing, print install advice and exit non-zero with a clear "skipped" message. No new runtime dependency (zero-runtime-deps rule).
- Runs against the task's managed preview via the server (same mechanism as `::repoos-preview-request::`); never runs `repoos serve` itself. `--target` selects a `[[preview.targets]]` entry explicitly, and the resolved target name is printed and recorded so a wrong target (default instead of docs-site) is visible instead of silent.
- Output goes to `work/.attachments/` (gitignored, never `git add`) and is linked from the task via the existing attachment path, so the reviewer and human can see it.
- Opt-in per project: repos with no preview targets never see it.

## Who runs it

- **Engineer**: once, at the end of a UI-visible change, before handoff (not before every `repoos check`). Skipped for non-UI changes. If the shot fails or the tool is unavailable, fall back to text verification and say so in the handoff.
- **Reviewer**: reads the attached screenshot alongside the diff. May re-run it, but the reviewer prompt still forbids editing files and status.
- Add a short rule to AGENTS.md (and the `repoos init` template only if deliberately intended) reconciling this with "previews are on request, not routine": a screenshot capture is the one sanctioned use of the managed preview by the engineer, and only for UI-visible changes.

## Out of scope

Visual-regression baselines, image diffing, per-component harnesses, any hosted service.

## Acceptance criteria

- [ ] `repoos shot` captures a PNG from the task's managed preview and writes it under `work/.attachments/`.
- [ ] `--target` overrides area-based routing; the resolved target is printed and stored with the attachment.
- [ ] Missing Playwright/browser gives a clear skip message with install advice, not a crash.
- [ ] No new runtime dependency; `repoos check` task-asset guard still passes (no tracked images).
- [ ] Attachment is visible on the task in the UI.
- [ ] AGENTS.md and `user-docs/` updated; Settings UI control only if a new `repoos.toml` key is added.
- [ ] Tests cover target resolution and the missing-browser path.

## Activity

- 2026-09-29T11:13:18Z · created · unknown
