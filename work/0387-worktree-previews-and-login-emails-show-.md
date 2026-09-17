---
id: "0387"
title: Worktree previews and login emails show the branch name instead of the repo name
type: bug
status: done
priority: p3
area: server
assigned_to: ai
created_by: ""
branch: feat/worktree-previews-and-login-emails-show-
model_override: openrouter/xiaomi/mimo-v2.5
review_model_override: opencode-go/hy3
created_at: "2026-09-17T11:17:47Z"
updated_at: "2026-09-17T13:13:17Z"
---
## Problem

There is no canonical "project/repo display name" concept anywhere in RepoOS. Every place that shows a repo name to a user computes it the same way — `basename(config.root)` — and `config.root` resolves to the *worktree's own directory* when the server is running inside a task worktree (worktree dirs are `join(worktreesDir(root), branch)`, see `ensureWorktree` in src/core/git.ts). Since a worktree's directory name IS the branch name, every one of these surfaces leaks the branch name through instead of the repo name:

- **Login/invite emails**: the OTP subject/body and invite email both read `const repoName = basename(config.root)` in `src/server/routes/auth.ts` (used at lines ~161, 165, 168-174, 192, 196-204; also duplicated at line ~112 for the default `fromName`, and line ~356 in an API response). A user opening a task's managed preview and logging in sees a subject like "RepoOS Login Code — give-agents-page-lists-card-like-separat" instead of "RepoOS Login Code — repoos".
- **Preview/UI header**: `src/ui-app/src/stores/repo.ts` computes `repoName` client-side as `health.root.split("/").pop()`, fed from `root: config.root` in `src/server/routes/info.ts`. It's rendered in the TopBar pill (`src/ui-app/src/components/TopBar.vue`). The same `basename(config.root)` pattern is duplicated server-side for the PWA manifest name/short_name (`src/server/routes/ui.ts`) and again for the manifest + instance icon (`src/server/server.ts`, two spots).

This is a uniquely repoos-in-repoos problem right now: this repo's own `repoos.toml` `[preview]` config builds and serves the worktree's own compiled CLI, so a task's managed preview literally boots a second RepoOS server rooted at the worktree — and every one of the surfaces above then shows the branch instead of "repoos". A managed repo that isn't self-hosting previews wouldn't hit this today, but the underlying bug (using worktree basename as "the repo name") would bite any repo the moment someone opens a preview from a worktree and the app shows its own name anywhere.

The fix already has prior art to follow: `src/server/deployments.ts` gets this right by using `mainCheckoutRoot(config.root) ?? config.root` instead of the raw `config.root` — none of the buggy call sites use that helper.

## Desired UX

- A user requesting a login code (or invite) for a preview running out of a worktree sees the *repo's* name in the subject/body, not the branch — e.g. "RepoOS Login Code" the same as they'd see from the main checkout.
- When it's useful to also show which worktree/branch a preview is serving (so a user with multiple tabs open can tell them apart), show it *in addition to* the repo name, not instead of it — e.g. a TopBar pill or email subject reading "repoos × give-agents-page-lists-card-like-separat" rather than either name alone. Truncate long branch names sensibly rather than letting the pill/subject overflow.
- The PWA manifest name, short_name, and instance icon follow the same corrected name.

## Acceptance criteria

- [ ] Add a single project-display-name resolver (new function, e.g. `projectDisplayName(root)` near `mainCheckoutRoot` in `src/core/git.ts` or alongside config loading) that: prefers an explicit name if one is configured (consider adding an optional `[project] name` to `repoos.toml`, falling back to `package.json`'s `name` if present), and otherwise falls back to `basename(mainCheckoutRoot(root) ?? root)` — never the raw worktree basename.
- [ ] `src/server/routes/auth.ts`'s OTP/invite email subject, body, default `fromName`, and the `repoName` field in its API response all use the new resolver instead of `basename(config.root)`.
- [ ] When the server is running out of a worktree (i.e. `mainCheckoutRoot(config.root)` differs from `config.root`), the email subject/body includes both the repo name and the branch, e.g. `${repoName} Login Code — ${branch}` or similar — not just the bare repo name and not just the branch as today.
- [ ] `src/ui-app/src/stores/repo.ts`'s `repoName` computed (backing the TopBar pill in `src/ui-app/src/components/TopBar.vue`) shows the corrected repo name, and — when serving out of a worktree — the same "repo × branch" combination, sourced from the server (extend the `/api/info` health payload rather than re-deriving from `root` client-side, since the client can't tell a worktree path from a normal one).
- [ ] `src/server/routes/ui.ts` (PWA manifest name/short_name) and `src/server/server.ts` (manifest + instance icon, two call sites) all use the same resolver.
- [ ] No change to behavior for the common case (server running from the main checkout, not a worktree) — this only changes what's shown when `config.root` is itself a worktree.
- [ ] `repoos check` passes.

## Notes for AI

- Investigation already done; see file:line references in Problem above — re-verify them against current `main` since line numbers drift, but the pattern (repeated `basename(config.root)`) should still grep cleanly.
- `mainCheckoutRoot` already exists and is used correctly in `src/server/deployments.ts:142` — follow that precedent rather than inventing a new way to find the main checkout.
- Keep the "repo × branch" combination logic in one shared place if possible (server-side, exposed via `/api/info`) so the email code and the UI code don't duplicate the truncation/formatting logic.
- Adding `[project] name` to `repoos.toml` is optional scope — the fallback chain (package.json name → main-checkout basename) is enough to fix the bug on its own; only add the explicit config key if it's cheap to wire through `src/core/config.ts` alongside the existing parsing.
- Scope this to the naming/display bug only; do not touch preview target selection, auth flow logic, or anything unrelated to how the repo's name is computed and shown.

## Activity

- 2026-09-17T11:17:47Z · created · unknown
- 2026-09-17T11:44:09Z · status inbox→ready
- 2026-09-17T11:46:05Z · review_model_override
- 2026-09-17T11:46:15Z · model_override
- 2026-09-17T11:46:19Z · review_model_override
- 2026-09-17T11:46:21Z · status ready→active, branch
- 2026-09-17T12:10:49Z · status active→review
- 2026-09-17T13:13:17Z · status review→done, release:success
