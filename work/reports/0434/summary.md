## TL;DR

Task 0434 fixed one docs-debt finding: `docs/close-out-pipeline.md` still described a fixed-name `com.repoos.watchdog` LaunchAgent that polled `/api/health` every minute and kickstarted the service after three consecutive failures. No such service exists in the code — the shipped service-management feature uses per-repository launchd/systemd services with OS-level `KeepAlive` restarts and RepoOS's own explicit health-check action. The engineer rewrote the stale section to describe the supported foreground (`just serve`) and managed-service (`repoos service` / Settings) workflows, kept the dated 2026-08-23 crash-loop incident but marked it as an obsolete manual setup, and the change shipped as one engineering round, one review pass ("good to go"), and a clean close-out.

## Outcome

The task shipped a documentation-only change to `docs/close-out-pipeline.md` (+26 / −49):

- The obsolete A/B instructions for bootstrapping two global LaunchAgents (`com.repoos.serve` and the nonexistent `com.repoos.watchdog`) were replaced with the workflows the implementation actually supports: a foreground server via `just serve`, and opt-in background operation via Settings or `repoos service`.
- The guide now states that foreground and managed-service modes must not occupy the same repository port simultaneously, and links to the user-facing service documentation.
- The 2026-08-23 crash-loop incident narrative was retained, but with a short status note identifying it as an earlier manual configuration rather than the current setup, so the useful incident history was not discarded while the stale commands were removed.
- No implementation change was needed; the finding was real drift, and its suggested fix ("describe KeepAlive instead") was only partly current — the guide was corrected to describe the shipped per-repository service feature rather than merely relabeling the watchdog.

Final verdict: review pass 1 returned **good to go**; the close-out gate completed successfully (153s) and the task was marked done with `release:success`, merged as commit `784a8814d4e03b8b01e6d579e82b977357902ab1`.

## Process stats

| Item | Value |
| --- | --- |
| Engineering rounds | 1 |
| Review passes | 1 (verdict: good to go, state ok) |
| Task created | 2026-09-19T02:09:23.307Z |
| Task done | 2026-11-19T01:46:31Z |
| Wall-clock, created → done | Just under two months, almost entirely waiting (the task sat in `needs_input` from 2026-10-05 until 2026-11-19, when it moved inbox→ready→active) |
| Active execution window | 2026-11-19T01:39Z → 01:46:31Z (≈ 7 minutes, from recorded timestamps) |
| Engineer | agent `engineer`, model `gpt-6-luna` (codex); 110s, 638,395 tokens; cost not recorded |
| Reviewer | agent `reviewer`, model `gpt-6-luna` (codex); 16s, 98,060 tokens; cost not recorded |
| Routing sessions | Model router (openrouter), model unknown; 1s and 0s; tokens not recorded |
| Restarts or agent swaps | None recorded |
| Token total (engineer + reviewer) | 736,455 tokens (routing tokens not recorded) |
| Cost total | Not recorded |
| Close-out gate | 153s, completed successfully |

## What went wrong

- **Long stall in `needs_input` (2026-10-05 → 2026-11-19).** The task went to `needs_input` on 2026-10-05 and sat there for roughly six weeks until 2026-11-19, when it moved inbox→ready and was started. The facts do not record what unblocked it. This delayed a small p2 chore by the better part of two months; the eventual active work took only minutes.
- **CTO nudge: held — handoff gate running (2026-11-19T01:41:12Z).** A nudge arrived while the task was active but the handoff gate was already running; the task moved to review ~90 seconds later without further incident. No restart was needed.
- **Task body underspecified at handoff.** A note recorded at 01:42:43Z flagged that the task body was missing "Problem", "Acceptance criteria" and "Notes for AI" sections — a template-completeness gap on a human-authored docs-debt task, not a blocker for the work. Resolution: none required beyond the note; the review passed anyway.
- **Shots skipped.** The diff (3 changed paths) touched no capture target's globs, so screenshot capture was correctly skipped — a non-issue, recorded here for completeness.
- No crashes, failed gates, flaky checks or restarts were recorded. Both guard verifications in review (browser console-error check, guard negative-test evidence) were skipped as not applicable to a docs-only change.

## Learnings

- **Docs must describe the shipped design, not the last-known design.** The finding's suggested fix ("say launchd KeepAlive handles it") would have produced a still-inaccurate doc: the real feature is per-repository service labels with opt-in install, OS-level restarts, and RepoOS's own explicit health-check action. The engineer verified against `service-manager.ts`, service routes and task #0185 before writing. Worth carrying into `docs/agent-workflow-rules.md`'s "docs gone wrong" guidance: when correcting a stale claim, verify the *current* implementation's scope, not just the absence of the old one.
- **Operational docs should name the service scope and trigger explicitly** rather than carrying forward assumptions from an earlier manual LaunchAgent setup — the direct lesson the engineer recorded. This belongs as a one-line rule in `docs/agent-ui-and-preview-conventions.md`'s operational-docs sibling or in `AGENTS.md` if a second incident confirms the pattern; it is currently only recorded here.
- **Historical incidents in how-to docs need a status marker.** The 2026-08-23 crash-loop narrative was worth keeping, but only once clearly labeled as an earlier manual configuration. Readers can't otherwise tell incident history from current instructions.
- **Docs-debt findings can outlive their own suggested fixes.** The watchdog claim was found by a Docs Debt Agent; by the time the task ran, the service-management implementation had shipped (#0185) and changed the correct answer. Re-validating the finding against the live repo before editing is the right move and worked well here.

## Follow-ups

None. (No linked tasks were recorded for this task, and the review found no further findings of this class after grepping `docs/close-out-pipeline.md`, `user-docs/cli.md`, service references under `docs/`/`user-docs/`, and watchdog references under `src/`.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
