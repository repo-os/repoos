---
id: "0558"
title: "Flag under-specified tasks as needing input, with a Send to PM action"
type: feature
status: done
priority: p2
area: [server, ui]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/flag-under-specified-tasks-as-needing-in
created_at: "2026-09-27T17:27:54Z"
updated_at: "2026-09-27T18:43:22Z"
---
## Problem

A task can end up only partly created: usually the PM agent hit some snag while
fleshing out a freeform task and gave up, or returned output that never got
written as real task content. The result is a task whose body is still the raw
`## Original prompt` (or a thin stub with none of the required sections) wearing
a task file's clothes.

Nothing marks it. It looks like any other card, so the human drags it out of
`draft` into `inbox`/`ready` without noticing, and an engineer agent later picks
up a task with no Problem, no Desired UX, no acceptance criteria, and no Notes
for AI — i.e. not ready to be worked at all. The `needs_input` mechanism already
exists (card status line, drawer header chip, banner, Needs You panel,
`needsInputReason`) but nothing in it speaks to "this task was never actually
written".

The fix is a detection pass that raises the existing flag with its own reason,
plus a way out of it from the banner: hand the task back to the PM agent to
flesh out, or do it by hand.

## Desired UX

- When a task that is not fully fleshed out is moved out of `draft` (to `inbox`,
`ready`, or anything else), it is flagged as needing input — **after** the
move, so the flag is what survives the human's own status change, not a
pre-move veto of the move. The move is not blocked.
- The card status line and the drawer's header chip read **"Doesn't look fully
fleshed out"** (distinct from the other needs-input reasons).
- The drawer's banner reads: this task doesn't look fully fleshed out yet —
probably the PM agent didn't finish writing it. Suggestion text underneath
tells the human they have two options: **send it to the PM agent**, or
**write the missing sections themselves**.
- The banner's primary action is a **"Send to PM (fleshes this out)"** button.
Clicking it does exactly what clicking into the PM tab and clicking the
"Can you flesh this out?" canned prompt does — the same message, the same PM
route, the same PM agent/model resolution — and then leaves the human in the
PM tab watching the run. The flag clears the moment the message is sent (same
behaviour as the existing `cto-escalation` reason), and the card shows the
existing "PM is working" indicator.
- The existing **Dismiss** action still works for the do-it-yourself path, so a
human who fills in the sections themselves clears the flag and records it in
the Activity log.

## Acceptance criteria

- [ ] A pure, unit-tested server-side predicate (no LLM call) decides whether a
task is under-specified. It treats a task as under-specified when any of
these hold:
- the body is missing one or more of `## Problem`, `## Desired UX`,
`## Acceptance criteria`, `## Notes for AI`;
- the body has no substantive content outside a `## Original prompt`
section (the un-fleshed-out freeform draft case);
- the body (excluding `## Original prompt`) is shorter than a small
threshold — assumption: 400 characters;
- required headings exist but are empty, or the body still contains unfilled
placeholder markers (`TODO`, `TBD`, `<placeholder>`).
- [ ] The flag is raised with a new machine-readable
`needs_input_reason` of `underspecified` and a
`needs_input_detail` naming the signals that tripped (e.g.
`missing sections: Desired UX, Acceptance criteria; body is only the
original prompt`).
- [ ] The flag is raised on a status change **out of** `draft` to any status
(`inbox`, `ready`, and anything else), on the `PATCH /api/tasks/:id`
path — after the status write, and it is not cleared by that same write.
- [ ] The flag is raised on the freeform PM paths too: when a PM flesh-out run
fails (the existing `recordFreeformFailure` branch in
`finalizeFreeformRun`), and when it "succeeds" but the body it wrote still
trips the predicate.
- [ ] The flag never clobbers an existing `needs_input` that was raised for a
different reason (`dev-error`, `watchdog-stuck`, `cto-escalation`,
questions, `review-failed`, …). Those keep their reason and detail.
- [ ] The new reason is registered in all four copy maps in
`src/ui-app/src/lib/needs-input-ui.ts` (status label, banner text,
suggestion text, primary action) with a new primary-action kind for
"send to PM", so the card status line, header chip, drawer banner and
Needs You panel all say the same thing.
- [ ] The banner's primary action posts the existing canned
"Can you flesh this out?" message to the existing PM message route
(`POST /api/tasks/:id/pm`), clears `needs_input` on success, and switches
the drawer to the PM tab. No new PM code path, no second prompt string.
- [ ] The action button is disabled/hidden when the response is not ok (PM not
configured, PM busy) and the error is surfaced as a toast; no silent
no-op.
- [ ] `needsInputClearsOnSuccessfulReview` is **not** extended to the new
reason — a successful reviewer run must not silently clear
`underspecified`.
- [ ] Dismiss still clears the new reason (existing
`POST /api/tasks/:id/dismiss-needs-input` → `dismissNeedsInputOnTask`
behaviour), and the activity entry names it.
- [ ] Tests: pure-predicate unit tests (each signal, and a well-formed task
that is NOT flagged); a server test that a `draft` → `ready` PATCH raises
the flag and leaves the status change in place; a server test that an
existing `dev-error` flag is not overwritten; a UI test for the new status
label, banner text and the "Send to PM" primary action wiring.

## Notes for AI

- **Assumption — detection is a heuristic, not an LLM verdict.** The PM agent
was already asked to produce a complete file; the failure mode is that it
didn't, so re-asking a model to grade it would cost tokens and be less
predictable. Keep the predicate in `src/core/` (a new small module next to
`needs-input.ts` is fine) so it is shared by the server and the UI the same
way `needs-input.ts` is today.
- **The flag must survive the human's own status move.** That is the whole
point of the task. A bare `PATCH` status change does not currently clear
`needs_input` — do not add such a clear, and do not add a pre-move refusal.
- **Assumption — the check fires on leaving `draft` and on PM flesh-out
outcomes only.** It is not a periodic sweep. Transitions that a human takes
deliberately after the fact (`start`, `pause`, `abandon`, `reopen`) keep
clearing `needs_input` as they do today; a human who starts an underspecified
task has made their call.
- **Assumption — send-to-PM clears the flag on send**, mirroring
`cto-escalation` ("clears when your message is sent"). It does not wait for
the run to finish; if the run leaves the body still stubbed, the next
flesh-out outcome or the next status change re-raises it.
- Reuse the canned prompts already in
`src/ui-app/src/stores/repo.ts` (`"Can you flesh this out?"` for draft and
inbox) — the button should send the same string, not a parallel one.
- Copy for the new reason goes in `src/ui-app/src/lib/needs-input-ui.ts` only;
do not inline strings in `TaskDrawer.vue`, `TaskCard.vue`,
`StoriesView.vue` or `NeedsYouPanel.vue`.
- No new `repoos.toml` setting is needed. If you add a knob anyway, it must
ship in the same change with a `getConfigSchema()` entry and a Settings
control (AGENTS.md rule).
- No new LLM call site, so no `recordOneShotSession` work — the PM turn this
button starts is already recorded by the `AgentRunner` path.
- Dialog/button styling: the banner already lives in the drawer; do not build a
new overlay. If you need a dialog, use `ui/dialog/*` and the global form
classes, and body-teleport it.
- Do not widen this into changing the PM prompt or the freeform promotion flow.

## Scope

In scope: the detection predicate, the `underspecified` reason and its copy, the
flag raises on leaving `draft` and on PM flesh-out outcomes, and the
"Send to PM" primary action on the needs-input banner.

Deferred: a one-off backfill sweep that flags already-created stubs sitting in
`inbox`/`ready`; a bulk "fix all flagged tasks" action; applying the same
detection to stories; asking the PM agent to self-verify before writing a task.

## Related

- `src/core/needs-input.ts` — reviewer-episode clear rules; the new reason must
stay out of `needsInputClearsOnSuccessfulReview`.
- `src/ui-app/src/lib/needs-input-ui.ts` — single source for the card line,
header chip and banner copy.
- `src/server/routes/tasks.ts` — `finalizeFreeformRun` (PM flesh-out success
and failure paths) and `patchTask` (the status-change path).
- `src/server/needs-input-dismiss.ts` — the do-it-yourself exit.
- `src/server/pm-runs.ts` / `src/server/freeform-runs.ts` — the "PM is
working" indicator the new button should reuse.

## Original prompt

When it's obvious that a task is not fully fleshed out (usually because the PM AI hit some snag and didn't finish "creating the task" for some reason, we should flag it as "needs input" from a human with the comment that it doesn't look fully fleshed out yet and tell them that they can send it to the PM agent or do it themselves (have a button to send to PM in that case - which would do the same thing as clicking into the PM tab and clicking on "please flesh this out"). The reason for this is sometimes I don't notice that it's not fully fleshed out and I move the task from draft state into inbox/ready etc when it's clearly not ready...

## Screenshots

![Screenshot-2026-09-28-at-01.24.44](/api/tasks/0558/attachments/screenshot-1.png)

## Activity

- 2026-09-27T17:27:54Z · created · hello@repoos.org
- 2026-09-27T17:27:54Z · screenshots
- 2026-09-27T17:29:45Z · status draft→inbox, title, area, body
- 2026-09-27T17:32:37Z · status inbox→ready
- 2026-09-27T17:32:38Z · status ready→active, branch
- 2026-09-27T17:44:38Z · status active→review
- 2026-09-27T18:43:22Z · status review→done, release:success
