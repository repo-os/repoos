---
id: "0637"
title: Don't re-run close-out validation when main only gained inputs/stories bookkeeping; add storiesDir config
type: bug
status: ready
priority: p1
area: [server, core]
assigned_to: ai
created_by: ""
branch: ""
cli_override: opencode
model_override: openrouter/openrouter/pareto-code
review_cli_override: opencode
created_at: "2026-10-03T08:45:43Z"
updated_at: "2026-10-03T09:11:22Z"
---
## Problem
#0633's Move to done timed out (closeOut.timeoutMs default 360000 = 6 min) because a fully passing validation was thrown away and re-run. Timeline (UTC, .repoos/logs/tasks/0633.log): close-out started 08:00:14; remote validation passed in 260s at 08:04:42; at 08:05:14 'main drifted during publish — resyncing'; the second remote validation passed in 282s at 08:10:05, past the budget; 'close-out hit its pipeline timeout'.

The drift was creating tasks #0634 and #0635 from inputs: commits like 'inputs(<id>): capture', 'inputs(<id>): resolved to task #0634' that only touched inputs/*.md. mainDriftIsBookkeepingOnly (src/server/integration-orchestrator.ts, isNonCodePublishDrift) only treats the work dir and dist/ as safe churn, so an inputs/ commit counts as code and forces a full resync. Same class of bug as #0376/#0382 (publish-time resync loops from bookkeeping commits).

Two related gaps:
- The VALIDATE-time drift check (~line 1396, 'main advanced during validation … revalidating') has no bookkeeping exemption at all; only the publish-time check does. A burst of bookkeeping commits during the (4+ min) remote run discards the work.
- The stories directory is a hard-coded constant (STORIES_DIR = 'stories' in src/core/story-definition-files.ts), unlike workDir / docsDir / skillsDir / inputsDir which are config keys, so it cannot be referenced consistently from the drift check.

## Desired behaviour
- Main advancing only via files under the work dir, inputs dir, stories dir, or dist/ never triggers a resync, at publish time OR validate time. Any other path (src/, docs/, user-docs/, skills/, landing/, macos/, telegram-manager/, scripts/, repoos.toml, package.json, …) still does.
- docs/ and user-docs/ stay classified as code on purpose: the check plan builds user-docs and tests may read docs, so a docs change can alter a validation result.
- A new storiesDir config key (default 'stories') replaces the STORIES_DIR constant everywhere it is used (story-definition-files.ts, watcher.ts, …), is in getConfigSchema() with a Settings control (guarded tier, restartRequired like inputsDir/workDir) and a test, and is documented in user-docs/configuration.md.
- The exempt set is one small named list derived from config (workDir, inputsDir, storiesDir, dist/), so adding another bookkeeping directory later is a one-line change.
- Drift that is bookkeeping-only is logged as such (the publish path already logs 'main advanced with bookkeeping-only commits — publishing without a resync'); do the same on the validate path.

## Acceptance criteria
- Unit tests for mainDriftIsBookkeepingOnly: work-only, inputs-only, stories-only, dist-only, and a mix of those are all bookkeeping; a mix including any src/ or docs/ file is NOT; a git error fails closed (not bookkeeping); custom workDir/inputsDir/storiesDir values are respected.
- Validate-time drift test: main advancing with only inputs/ commits does not discard the candidate or reset the job to syncing; a src/ change still does and still respects MAX_VALIDATE_DRIFT_RETRIES.
- storiesDir: default is 'stories', existing repos need no migration, an invalid or absolute/escaping value falls back to the default with a warning, and all former STORIES_DIR call sites use config.
- Repro test or fixture based on the #0633 timeline: a close-out whose only intervening commits are inputs(...)/docs(...) task commits completes with a single validation.
- docs/close-out-pipeline.md (bookkeeping-drift section) and user-docs/configuration.md updated.

## Notes for AI
- This is the close-out pipeline: do not change the semantics of anything but the drift classification. When the drift check decides 'resync', behaviour must be unchanged.
- Self-modifying config change (a new key): the parser must still read every existing repoos.toml; verify against this repo's own file and the work/ files.
- Do NOT broaden the exemption to docs/, skills/ or other human/agent-edited directories to 'fix' timeouts; if more headroom is needed, the lever is closeOut.timeoutMs (unset in repoos.toml; the 6 min default leaves under a minute of slack over a ~4.7 min close-out and remote runs have grown ~10% in a week). Consider a follow-up to make the pipeline budget scale with measured remote duration or to not count a discarded validation attempt twice, but keep that out of this task.
- Mid-run drift can still invalidate a run when real code lands on main; that stays correct.
- The new inputs/ and stories/ commits are produced by the server itself, so they must never be treated as competing work.

## Activity

- 2026-10-03T08:45:43Z · created · unknown
- 2026-10-03T09:10:52Z · cli_override, model_override
- 2026-10-03T09:11:16Z · model_override
- 2026-10-03T09:11:18Z · status inbox→ready
- 2026-10-03T09:11:22Z · review_cli_override
