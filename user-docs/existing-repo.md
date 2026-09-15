# Adding RepoOS to an existing repo

RepoOS is designed to drop into a repo you already have. `repoos init` is
idempotent — it **never overwrites an existing file**, only creates what's
missing — so it's safe to run on an established project.

## What `repoos init` adds

From the root of your repo:

```bash
repoos init
```

It creates only what isn't already there:

| Path | What it is |
| --- | --- |
| `work/` | One markdown file per task. The board. |
| `docs/` | Context an agent reads before working — architecture notes, decisions, history. |
| `AGENTS.md` | The cross-tool agent-instructions standard. |
| `repoos.toml` | Configuration. Every field is optional. |
| `work/0001-set-up-repoos.md` | A first task, ready to work. |
| `.env.example` | Documents the secrets a fuller setup expects. |
| `.gitignore` entries | Ignore the derived cache (`.repoos/`) and local secrets (`.env`). |

If `AGENTS.md` or `.gitignore` already exist, they're left alone — `.gitignore`
is only *appended* to if the two RepoOS lines are missing, and an existing
`AGENTS.md` is kept as-is. Re-running `repoos init` reports "already set up" and
changes nothing.

## What it doesn't touch

Your source, your `package.json`, your build pipeline, and your existing docs
are all untouched. RepoOS adds a few directories and a local server that reads
them; it isn't a hosted service and it doesn't ask you to move your work
anywhere.

If your project uses a build pipeline RepoOS doesn't recognise, the
[check gate](/check) degrades gracefully rather than failing you for not looking
like RepoOS.

## Adopt incrementally

You don't have to move your whole roadmap at once:

1. Run `repoos init` and commit `work/`, `docs/`, `AGENTS.md`, and
   `repoos.toml`. `AGENTS.md` is what agents read first, so getting it into the
   repo is what makes agents useful here.
2. Add a handful of tasks with `repoos new` and work them through the lifecycle.
3. Grow `docs/` as you go — each durable decision you write down once stops
   being re-derived on every future task. See [Concepts](/concepts).

## Running it outside a git repo

Run `repoos init` in a directory that isn't inside a git repo and it switches to
a guided flow for a brand-new project instead: it can create the project in a
subdirectory, offer a repo-root or `repoos/`-subfolder layout, take a one-line
description for the sample task, and optionally make the initial commit.

## Next

```bash
repoos serve     # start the local control plane
repoos new "Fix the login redirect loop"
```

Then see [Install and first task](/getting-started) for the lifecycle, or
[Configuration](/configuration) for `repoos.toml`.
