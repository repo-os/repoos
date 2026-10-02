# Simulated first-time users

Run AI coding harnesses against RepoOS with a bare prompt ("build an app using
RepoOS", plus an app idea) and no other help, then triage what tripped them up.

## Quick start

```bash
bun scripts/sim-users/run.mjs --smoke      # does every harness + model resolve and answer? (no RepoOS)
bun scripts/sim-users/run.mjs --dry-run    # print every command and a sample prompt
bun scripts/sim-users/run.mjs              # full matrix: 5 harnesses x every app, 1 rep each
bun scripts/sim-users/triage.mjs ~/repoos-sim-users/<stamp>   # analysis agent writes TRIAGE.md
```

Flags: `--harness a,b`, `--app x,y`, `--mode assigned|choose` (assigned = each run
gets one app so runs are comparable; choose = the agent picks from the full list),
`--reps N`, `--concurrency N`, `--timeout-min N` (default 45), `--out DIR`,
`--repoos-bin PATH` (skip the npm install and use this binary, e.g. a dev build),
`--git-init` (start from a git-initialised dir instead of an empty one).

## What a run does

1. Installs the **published** `@repo-os/repoos` from npm into `<out>/_tools` (once)
   and puts it first on `PATH`. It is not your `bun link` dev build.
2. Creates `<out>/<harness>__<app>__r<N>/project/` outside any git repo, so no
   parent `AGENTS.md`/`CLAUDE.md` is picked up, and launches the harness there
   headlessly with the permission bypass RepoOS's own drivers use.
3. Saves `prompt.md`, `transcript.jsonl`, `stderr.log`; after the run it kills
   leftover processes (dev servers) and writes `meta.json`, `board.txt`
   (`repoos list`), `check.txt` (`repoos check`) and moves out `FRICTION-LOG.md`.

## Harnesses

Flags and model ids mirror `cliCommand`/`modelArgs` in `src/server/agents.ts` and
the model ids RepoOS has already run with (`.repoos/index.json`). Edit
`harnesses.mjs` to change one.

| Name | Command | Model |
| --- | --- | --- |
| claude-haiku | `claude -p` | `haiku` |
| codex-luna | `codex exec` | `gpt-6-luna` |
| opencode-deepseek | `opencode run` | `openrouter/deepseek/deepseek-v4.1-flash` |
| pi-deepseek | `pi --mode json` | `openrouter` / `deepseek/deepseek-v4.1-flash` |
| cursor-composer | `cursor-agent -p` | `composer-2.5` |

Credentials come from the logged-in harnesses already on this machine; the
scripts never read or print them.

## Prompts

`prompts/base.md` (the only thing the agent is told), `prompts/apps/*.md` (one
file per idea; add a file to add an app), `prompts/friction-log.md` (appended to
every run), `prompts/triage.md` (for the analysis agent).

## Contamination

Runs use your real `HOME` so the harnesses stay logged in. The runner warns if a
non-empty global instruction file exists (`~/.claude/CLAUDE.md`,
`~/.codex/AGENTS.md`, ...). `~/.claude` memory and any global skills/plugins can
still leak and are not detected; check before trusting a run's "first time" read.

## Known gaps

- Auth is off by default in a fresh `repoos init`, and `prompts/base.md` tells the
  agents to keep it off, so the email-OTP login is deliberately not measured.
- Port clashes: `repoos serve` derives a stable port from the repo path, and each run has
  its own path. `prompts/base.md` tells agents to use a distinctive project name, not pin a
  RepoOS port, and pick a random port in 3000-3999 for their app. Random picks can still
  collide (about 10% at 15 parallel runs, much less at 3); a collision shows up as a run
  failure in triage.
- Agents under-report friction, so triage trusts the transcript over the log.
