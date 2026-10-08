---
id: "0528"
title: Hide docs-only commits from git history by default
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/hide-docs-only-commits-from-git-history-
created_at: "2026-09-27T06:52:20Z"
updated_at: "2026-09-27T10:11:42Z"
---
## Problem

On the Context page's History tab, most of the git history in a RepoOS-managed
repo is `docs(...)` commits — task-status flips, activity entries, `work/*.md`
bookkeeping, doc-status updates. They outnumber the commits a human actually
cares about (features, fixes, refactors, merges), so the important git events are
buried and the list is hard to read at a glance. The only narrowing control
today is the path filter, which filters by file path, not by kind of commit, and
there is no way to say "I don't care about docs churn right now".

## Desired UX

- The History tab loads with `docs(...)` commits **hidden by default**. The
visible list is the signal: real code work, reviews, merges.
- The toolbar (alongside Branch and Path) gains one toggle to bring them back —
labelled as an inclusive action, e.g. **"Show docs commits"**, with a short
title/hint explaining that these are task-status and documentation bookkeeping
commits. Off by default.
- Toggling takes effect immediately (no separate "Apply" click) and refetches the
current branch's first page, preserving the currently selected branch and path
filter.
- "Load more" paging continues to respect the toggle, so paging fills up with
visible commits rather than silently consuming the page on hidden ones.
- The choice is a per-browser view preference: it survives navigation and a page
reload, and a first-time visitor gets the filtered (docs-hidden) view.
- If the filter leaves nothing to show — a branch or path whose commits are all
`docs(...)` — the empty state says so and points at the toggle instead of
claiming there is no history at all.
- Day-group headers are only rendered for days that actually have visible
commits.

## Acceptance criteria

- [ ] `GET /api/repo/log` accepts an opt-in query param (e.g. `includeDocs=1`);
    when the param is absent, `docs(...)` commits are excluded from the page.
- [ ] The exclusion happens in the git log invocation itself, not as a post-fetch
    trim, so a page of `limit` returns `limit` *visible* commits and
    `nextCursor` is computed after filtering.
- [ ] First load of the History tab with no saved preference shows no `docs(...)`
    commits.
- [ ] The toolbar toggle switches between hidden and shown in one click, refetching
    without the user pressing Apply.
- [ ] The toggle composes with the branch and path filters; changing branch or path
    keeps the current toggle value, and the toggle's refetch keeps both.
- [ ] Toggling resets paging to the first page and clears the "load more" cursor
    and any expanded rows.
- [ ] The toggle's state persists across a page reload, using the existing
    client-local preference pattern (see `stores/ui.ts`).
- [ ] When filtering hides everything, the empty state names the toggle as the way
    to see the hidden commits.
- [ ] Day groups with zero visible commits render no header.
- [ ] Commit detail expansion, the diff view (`/repo/commits/:sha`) and the
    `/api/repo/commits/:sha` endpoint are unaffected — this is list filtering
    only, and a hidden commit's diff stays reachable by URL.
- [ ] Tests cover: `listRepoLog` excludes `docs(` subjects by default, includes
    them with the flag, and still returns a correct `nextCursor` under the
    filter; the UI test covers the default-hidden state and that toggling
    refetches with the flag.
- [ ] `bun run fmt` has been run before committing on the branch, and `repoos
    check` is green.

## Notes for AI

- Files in play: `src/core/repo-log.ts` (`listRepoLog`), the route in
`src/server/routes/repo-log.ts` (parse the new query param), the panel
`src/ui-app/src/components/RepoHistoryPanel.vue` (toggle + toolbar + empty
state), `src/ui-app/src/stores/ui.ts` (persisted preference, alongside the
other client-local toggles), and possibly a shared predicate in
`src/ui-app/src/lib/repo-history.ts`. Tests: the existing history UI test
(`src/ui-app/tests/context-history.test.ts`) and the core `repo-log` tests.
- Reuse the existing commit-convention parsing rather than writing a second
ad-hoc regex. RepoOS commits are `type(NNNN): subject`; `extractTaskId` /
`splitTaskSubject` already parse the leading type. The filter is "subject type
is `docs`", anchored at the start of the subject.
- Keep git invocations argv-based (never a shell string). `git log --invert-grep`
takes a regex: pass the pattern with `--extended-regexp` and an escaped paren
(`^docs\(`), or use a git pathspec-style exclusion. The pattern is a constant,
not user input — never interpolate anything into it.
- Do **not** implement this as a client-side filter over an already-fetched page:
a 50-commit page that is mostly `docs(...)` would render nearly empty and pop
the "load more" button immediately, which is the exact problem this task
exists to fix.
- Assumption: "docs()-related" means the subject's type prefix is `docs` (RepoOS's
own convention). Other types are unaffected, and a commit that merely mentions
docs later in its subject line is still shown.
- Assumption: the toggle is a per-browser view preference persisted in
`stores/ui.ts`, not a `repoos.toml` setting — so per AGENTS.md no Settings-page
entry or `getConfigSchema()` change is required. If you conclude it *should* be
a config setting instead, say so in the handoff rather than adding it silently.
- Assumption: default is hidden; a first-time visitor sees the filtered list.
- Use the existing styled toggle/checkbox control in the panel's toolbar. Don't add
a raw `<select>` or a bespoke input, and keep new CSS in the panel's style block
consistent with the existing `hist-*` classes.
- Do not change what `docs(...)` commits are or how RepoOS writes commit messages.
This task is display-only.
- Do not auto-request a preview; previews are on demand from the human (see
AGENTS.md).
- Scoped doc check before handoff: if the diff contradicts anything this touches
in `AGENTS.md`, `docs/`, or `user-docs/` (e.g. a description of the History tab
or the `/api/repo/log` parameters), fix that line in the same change.

## Scope

Covers: the Context page History tab commit list, the `/api/repo/log` query
parameter, and persistence of the toggle as a view preference.

Deferred: filtering other commit types (`chore`, `test`, …), a general
by-type/searchable commit filter, showing a count of hidden commits, applying the
filter to any other view (Dashboard, Agents), and any change to RepoOS's own
commit-message conventions.

## Related

- History tab UI: `src/ui-app/src/components/RepoHistoryPanel.vue`, mounted by
`src/ui-app/src/views/ContextView.vue`
- Log endpoint: `GET /api/repo/log` in `src/server/routes/repo-log.ts`, backed by
`listRepoLog` in `src/core/repo-log.ts`
- Commit-subject parsing: `extractTaskId` (`src/core/repo-log.ts`),
`splitTaskSubject` (`src/ui-app/src/lib/repo-history.ts`)
- Existing history tests: `src/ui-app/tests/context-history.test.ts`

## Original prompt

Most of the git history are docs() -related. let's add a filter for these so that by default we don't show them on this page, but have a toggle so user can toggle them on/off if they want to see them. This way it will be easier for a user to immediately understand the important git events.

## Screenshots

![Screenshot-2026-09-27-at-14.48.21](/api/tasks/0528/attachments/screenshot-1.png)

## Activity

- 2026-09-27T06:52:20Z · created · hello@repoos.org
- 2026-09-27T06:52:20Z · screenshots
- 2026-09-27T06:53:10Z · status draft→inbox, title, area, body
- 2026-09-27T06:53:46Z · status inbox→ready
- 2026-09-27T06:53:49Z · status ready→active, branch
- 2026-09-27T07:01:21Z · status active→review
- 2026-09-27T10:11:42Z · status review→done, release:success
