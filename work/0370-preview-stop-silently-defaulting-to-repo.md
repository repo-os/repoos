---
id: "0370"
title: "Preview: stop silently defaulting to RepoOS's own board when a project has no [preview] config"
type: feature
status: review
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/preview-stop-silently-defaulting-to-repo
created_at: "2026-09-16T06:38:15Z"
updated_at: "2026-09-16T06:59:03Z"
---
## Problem

`resolvePreviewTarget` (`src/server/preview.ts`) has two distinct "nothing
configured" cases today, and only one of them behaves well:

- `[preview]` section **present** but no target matches the task's `area` →
  returns `{ kind: "none", reason: "No preview configured for area X... add
  a [[preview.targets]] entry..." }`. This already reaches the user: `onError`
  in `src/ui-app/src/stores/repo.ts` shows the exact reason as a toast. Fine
  as-is.
- `[preview]` section **absent entirely** → silently returns `{ kind:
  "repoos", ... }`, which boots `repoos serve` rooted at the task's worktree
  and shows RepoOS's own board UI. For a project that isn't RepoOS itself
  (squishy, or any other adopter), this is never the right thing — there is
  no reason a Vue/Capacitor consumer app's task preview should show a task
  board. It "succeeds" with zero signal that anything is wrong, which is
  worse than an error: a new user has no idea the app they're looking at
  isn't theirs.

This is the same failure shape found repeatedly earlier this session
(`ui-smoke` hardcoded to RepoOS's own dashboard, #0348; the CLI-selection
label, #0345) — a behavior that only makes sense for RepoOS's own self-hosted
repo, shipped as the generic default for every managed project.

## Why the fallback existed, and why it may not need to anymore

The comment in `preview.ts` calls this "the RepoOS `repoos serve` fallback
that self-hosted repos have always had" — i.e. it predates #0362's
`[preview]` config option and exists for backward compatibility. This repo's
own `repoos.toml` NOW has explicit `[preview]` config (commit `a44bce4a`,
2026-09-16) covering exactly the case that fallback used to paper over. Check
whether the implicit fallback still has any legitimate reason to exist at
all, given that:
- RepoOS's own repo no longer needs it (it's explicitly configured).
- No other repo should ever want "show RepoOS's board" as their preview.

If investigation finds no remaining legitimate use, remove the fallback
outright rather than trying to gate it behind some "is this RepoOS itself"
detection (`package.json` name-sniffing, etc.) — simpler is better here, and
this codebase already has enough of that pattern (`expectsOwnCli` in
`integration-orchestrator.ts` is a similar heuristic from earlier today; don't
add a third one without a real reason). If some legitimate case for keeping it
turns up during investigation, report it before building anything — don't
assume.

## Decision needed: hide the button, or explain on click

Two options, not yet decided — pick one (or propose a third) with reasoning,
don't default to whichever is easier to build:

1. **Don't show a preview affordance at all** when the project has no
   resolvable target for the task — closer to what a user expects ("there's
   nothing to click because there's nothing configured") than a button that
   predictably explains itself away.
2. **Show the button; explain on click** — matches the "present but no
   match" case's existing behavior (actionable toast), consistent UX whether
   the gap is "wrong area" or "no config at all."

Whichever is chosen, the resulting message (toast, disabled-button tooltip,
or empty-state text) must be genuinely actionable: name the task's `area`,
and show the minimal `repoos.toml` snippet that would make it resolve — not
a generic "no preview available."

## Scope: web apps only, for now

Preview only makes sense today for something that can bind an HTTP port —
`[[preview.targets]].command` boots a process and polls a URL. Do not attempt
to design or build anything for a mobile app target in this task; there is no
settled answer yet for what "preview" means for a Capacitor/Ionic mobile
build, and forcing one now would be premature. If a task's `area` clearly
maps to a non-web thing, treat it the same as "no target configured" (from
the decision above) rather than inventing special handling.

## Open question: `area` is free text, single-valued, per task

`area:` has no schema (`--area | Free text — your own grouping`) and a task
carries exactly one. Two related gaps, worth naming even if not solved here:
- **A task spanning multiple areas** (e.g. a bug touching both a frontend and
  a backend) has no natural single preview target under area-matching alone.
- **Nothing enforces consistent area naming** across a project's own tasks —
  today's audit found this repo's own tasks mostly all use generic `area:
  web` regardless of whether they touch the main app, the landing page, or
  the docs site (see commit `a44bce4a`'s note on this).

Do not attempt a full redesign of area-based matching in this task. Record
whatever's learned investigating this (e.g. would matching by which paths a
task's diff touches be more reliable than a free-text field an agent has to
remember to set correctly?) as a documented open question or a follow-up
task, so it isn't lost.

## Acceptance criteria

- [ ] A project with no `[preview]` config at all no longer silently boots
      RepoOS's own board as a task's "preview" — either no preview
      affordance is shown, or clicking it explains how to configure one
      (per the decision above), consistently with the existing "present but
      no match" behavior.
- [ ] The message/empty-state is genuinely actionable: names the task's
      `area` and shows a minimal working `repoos.toml` snippet.
- [ ] This repo's own preview behavior (configured in `a44bce4a`) is
      unaffected — verify with a live spawn the same way that commit did,
      not just the resolver function.
- [ ] Explicitly out of scope, confirmed not touched: any mobile-preview
      design or implementation.
- [ ] The `area` free-text/single-value limitation is documented (in this
      task, `docs/`, or a linked follow-up task) even if not fixed.
- [ ] `repoos check` passes.

## Related

- #0362 — built the `[preview]` config mechanism this task tightens the
  default behavior of.
- Commit `a44bce4a` — this repo's own dogfooding of `[preview]` config,
  which may make the implicit fallback this task investigates fully
  removable.

## Activity

- 2026-09-16T06:38:15Z · created · unknown
- 2026-09-16T06:38:28Z · status inbox→ready
- 2026-09-16T06:38:28Z · note: Written up per user request to try next, before configuring previews on squishy.
- 2026-09-16T06:48:29Z · status ready→active, branch
- 2026-09-16T06:59:03Z · status active→review
