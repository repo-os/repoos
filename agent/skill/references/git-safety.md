# Leave unrelated Git changes alone

The repository may already contain work in progress. Your job is to add RepoOS,
not to tidy, reset, or commit someone else's changes.

## Before editing

```bash
git status --short
git diff --stat
git diff --cached --stat
```

Report anything already modified, staged, or untracked. Treat all of it as the
user's work.

## Rules

- **Never** run `git reset`, `git reset --hard`, `git clean`, `git stash`,
  `git checkout -- .`, `git restore .`, or `git revert` on changes you did not
  make. Do not use `git pull --rebase` or `git push --force`.
- **Never** stage with `git add -A`, `git add .`, or `git commit -a`. Stage the
  exact paths you changed, then review `git diff --cached`.
- **Never** commit unless the user asked you to. Leave changes uncommitted and
  summarize them.
- Do not delete or rewrite existing files to make room for the scaffold.
  `repoos init` already skips files that exist; if it reports a collision, stop
  and ask.
- Preserve `.gitignore` and `AGENTS.md` edits that are already there. `repoos
  init` appends its own entries and never replaces the whole file.
- If a command would change files outside the RepoOS scaffold, explain why and
  ask before running it.

## After editing

```bash
git status --short
git diff --check
```

List the files you touched, say which ones RepoOS generated, and call out any
change you did not expect. If `git diff --check` reports whitespace errors,
fix only the lines you added.
