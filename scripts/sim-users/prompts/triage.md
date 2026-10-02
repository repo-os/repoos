You are triaging a batch of simulated first-time-user runs of RepoOS. In each run an AI coding agent (a different harness/model each time) was told only to build a small app using RepoOS, with no other help.

Results directory: {{RESULTS_DIR}}

Each subdirectory is one run and contains:
- `meta.json`: harness, model, app, duration, exit status, and outcome checks
- `transcript.jsonl` (or `.log`): the raw agent transcript (large; search it, don't read it whole)
- `FRICTION-LOG.md`: the agent's own friction log and debrief (may be missing)
- `board.txt`: `repoos list` output at the end of the run
- `project/`: the final project

Do this:
1. Read every `meta.json` and `FRICTION-LOG.md`. Then skim each transcript for the moments the agent was stuck: repeated failing commands, error text from `repoos`, long gaps, wrong guesses about how RepoOS works, or workarounds. Agents under-report; trust the transcript over the log when they disagree.
2. Group findings into distinct friction points. Merge duplicates across runs. For each: a short title, what happened (with one concrete quote or command), how many runs hit it and which harnesses/models, severity (blocked the run / cost many steps / minor), and the likely RepoOS-side cause (docs gap, bad error message, missing default, bug, naming).
3. Note anything an agent did that RepoOS's own rules forbid (hand-editing `work/*.md`, `mv done` instead of the close-out pipeline, running `repoos serve` in a way that clashed, committing `dist/`). Those are signals that guidance is missing or unclear.
4. Write `{{RESULTS_DIR}}/TRIAGE.md`: a table of runs (harness, model, app, reached working app y/n, duration), then friction points ranked by (runs affected x severity), then a short list of what worked well.
5. Do NOT create RepoOS tasks. End by listing the top 5 friction points as proposed task titles so a human can file them.
