---
id: "0341"
title: Write out the remaining user-docs pages for docs.repoos.org
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/write-out-the-remaining-user-docs-pages-
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-09-13T15:12:36Z"
updated_at: "2026-09-15T16:47:58Z"
---
`user-docs/` (docs.repoos.org) was split out of `docs/` and seeded with four
pages: `getting-started`, `concepts`, `cli`, `configuration`. This task fills
out the rest.

## The audience (read this first)

These docs are for someone **adopting RepoOS in their own repo** — not for
someone working on RepoOS's codebase. That distinction is the whole reason
`user-docs/` exists separately from `docs/`; see `user-docs/README.md` and
`docs/README.md`. Do NOT republish or copy `docs/*.md` here: those are build
context for this project (architecture internals, incident history, ADRs) and
a new user has no reason to read them. Where the same subject appears in both,
they are different documents written for different readers.

## Pages worth adding

- **Agents** — configuring coding agents (which CLIs are supported, model
  selection, the Agents page), plus what the PM / engineer / reviewer roles
  actually do. **Explicitly distinguish this from the BUILT-IN agents**
  (Tech Debt, Performance, Architect, Design, and the forthcoming Docs Debt
  Agent — #0354) on the same "Build your team" page — they're a different
  concept (scheduled/on-demand scanners with their own coding-agent+model
  selection, not roles in a task's lifecycle) and a page that conflates the
  two will confuse a first-time reader of that page. A one-paragraph pointer
  to a future built-in-agents deep-dive is enough here; don't write that
  deep-dive in this task (see the follow-up task below).
- **The review gate AND the close-out/Move-to-done pipeline** — what `review`
  means, what the reviewer agent produces, how sign-off and merge-to-trunk
  work, and why an agent can't merge itself. Fold in what MTD (`validateCandidate`
  in `src/server/integration-orchestrator.ts`) actually does end to end, since
  a real adopter WILL hit this the first time two tasks are in flight at once:
  - The merge-conflict auto-repair path: a real (non-work-file) conflict
    against main is non-retryable and automatically hands off to an engineer
    session in the FEATURE branch's own worktree to merge main in and resolve
    it there, then MTD retries automatically. Observed live today (#0348) —
    document it as expected behavior, not a failure state, so a user watching
    a task bounce through active→review isn't alarmed.
  - The re-review/auto-bounce behavior: if new commits land on a branch
    while its task sits in `review` (e.g. you or an agent pushed a fix after
    the first review), RepoOS automatically re-reviews it, and a verdict of
    anything but "good to go" auto-bounces the task back to `active` with the
    findings sent to the engineer session (`review_rounds` increments; capped
    — see `MAX_AUTO_REVIEW_ROUNDS` in `src/server/review.ts`). Observed live
    today (#0350) — a user who moved a task to review, made one more commit
    on the branch, and later found it back in `active` needs this explained
    or it reads as a bug.
  - Requesting a preview of a task's changes: server-owned, on-demand, capped
    at one running at a time (FIFO eviction of whichever task's preview was
    running). Mention the dev-login shortcut for a repo with auth enabled
    (skip the email OTP) since a user previewing their own task will hit the
    login screen locally.
- **`repoos check`** — what the gate runs, how to make it meaningful in a repo
  that isn't RepoOS. As of today (#0348/#0349/#0350) most of this is now
  genuinely configurable rather than "assumes RepoOS's own build" — write the
  concrete mechanism, not just a caveat:
  - `ui-smoke` is opt-in per project: declare a `smoke` package.json script
    or `[check] uiSmoke` in `repoos.toml` (config wins if both are set); it
    skips cleanly with no command declared. RepoOS's own repo dogfoods this
    same mechanism rather than being special-cased.
  - The build-staleness step degrades to a skip (not a failure) for a
    project that isn't using RepoOS's own `dist/.build-info.json` build
    contract — a `src/` directory with a different build pipeline no longer
    hard-fails.
  - The task-asset guard's folder names come from `workDir`/`inputsDir` in
    `repoos.toml`, not hardcoded `work`/`inputs`.
  - Point to `docs/audits/2026-09-check-step-genericity-audit.md` for the
    step-by-step audit of what's configurable vs. still RepoOS-specific
    (`zero-runtime-deps`, for instance, is intentionally RepoOS-only).
- **Working with an existing repo** — what `repoos init` adds, what it doesn't
  touch, and how to adopt it incrementally.
- **Troubleshooting / FAQ** — the questions a new user actually hits. Worth
  covering:
  - Running RepoOS in more than one repo at once (per-repo derived ports,
    `repoos stop`), and — until the process-title work in #0347 lands —
    how to tell multiple running `repoos serve` instances apart today: each
    one's `/api/config` (or `repoos status`) reports its own `root`; `ps`
    alone won't distinguish them.
  - Picking a runtime (`REPOOS_RUNTIME`).
  - A "check failed" job you can't explain: read `docs/debugging-check-failures.md`'s
    triage order before assuming flakiness (this doc is `docs/`, i.e. build
    context for RepoOS itself — link to it rather than duplicating it, and
    say plainly that it's written for RepoOS's own repo, so a user's mileage
    on the specific incidents will vary even though the triage order
    generalizes).
- **Tunnels** — publishing a local instance via Cloudflare Tunnel, and the
  mobile app connecting to it.

## Deliberately deferred — not in this task

Spun into a follow-up task rather than growing this one further: a full
built-in-agents deep-dive (Tech Debt/Performance/Architect/Design/Docs Debt —
one section each, config, schedule, what "good" output looks like),
authentication setup (email OTP provider config, Google OAuth, the dev-login
backdoor for local development), and deployments/releases (`[release]` /
`[[deployments]]` in `repoos.toml`). These are real and worth documenting, but
lower-priority than the 10 pages above for a first-time adopter.

## Constraints

- The sidebar in `user-docs/.vitepress/config.mts` is hand-curated — VitePress
  does not generate it from the file tree. A new page must be added there or
  it will not appear in navigation.
- Verify locally with `just user-docs-dev` / `just user-docs-build`. Note that
  `repoos check` does NOT cover this directory (it's hardcoded to the root
  package.json + src/ui-app), so a green check proves nothing here.
- Write accurately: check claims against the actual CLI and `src/core/config.ts`
  rather than inferring. Where behavior is this-repo-specific rather than
  general RepoOS behavior, say so or leave it out.

## Activity

- 2026-09-13T15:12:36Z · created · unknown
- 2026-09-14T08:25:25Z · status inbox→ready
- 2026-09-15T15:50:35Z · body
- 2026-09-15T15:59:05Z · model_override
- 2026-09-15T15:59:11Z · status ready→active, branch
- 2026-09-15T16:23:27Z · status active→review
- 2026-09-15T16:47:58Z · status review→done, release:success
