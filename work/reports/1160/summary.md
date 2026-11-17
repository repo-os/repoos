## TL;DR

Remote validation now runs a project-declared check command (`remoteValidation.command` plus `remoteValidation.requiredTools`) on both Docker and native Linux/macOS runner hosts, so non-bun projects (e.g. Android/Gradle) can offload their pre-review gate to the runner pool instead of being limited to the fixed Bun sequence. Host probes verify the declared toolchain and the runner-script capability before dispatch. It took 5 engineering rounds and 5 review passes — review kept finding ways the custom command could silently not run (env-prefix split, Docker `ENTRYPOINT` swallowing argv, Hetzner ignoring the command) — before pass 5 returned `good to go` and the task landed (merged commit `a1a33fe0bd1c66956f80706e190f238242cb315b`, release:success). No live Android/Gradle or Tiao run was performed; that evidence gap remains.

## Outcome

Shipped, on branch `feat/remote-validation-let-any-project-run-it`:

- **`remoteValidation.command` and `remoteValidation.requiredTools` config keys**, parsed in `src/core/config.ts`, registered in the supported-key registry and config schema, and rendered as dedicated Settings → Remote validation controls (text input for the command, comma-separated array editor for tools) with save-payload tests.
- **Runner execution of the project command on both paths.** The native macOS validator runs the command inside a login shell (`bash -lc`) from the verified checkout with `REPOOS_ARTIFACTS_DIR` exported; the Docker validator selects the project command explicitly, passes it into the container with `-e REPOOS_VALIDATION_COMMAND`, invokes the image with `--entrypoint bash` so the image's own `bash -lc` ENTRYPOINT cannot swallow the argv, keeps the named-container lifecycle (`--name "$CONTAINER"`, watchdog, hang-kill, prefix reaper, slot release), and persists Gradle/npm/Bun caches in a named volume.
- **Host prerequisite probing** of the declared toolchain (plus host `git`), executed in the same shell environment as execution, with capability markers for mirror and project-command support; old copied runner scripts fail the probe with an update instruction instead of silently running the Bun gate. This covers the Tailscale pool and the Hetzner VM path.
- **Exit-code classification preserved**: a persisted gate-start marker distinguishes "the project gate actually ran" from Docker/setup failures, so project commands exiting 3/4/5/126/127 stay gate failures while Docker startup codes 125/126/127 and unguarded cache-volume/setup failures map to the reserved infrastructure exit 5.
- **Pool behavior**: jobs queue across eligible hosts and fall back to the project's local check plan when no remote host is available; `native` is no longer published as a routing capability (`os` and labels are).
- **Docs**: `docs/remote-validation.md` — the "not implemented yet" note removed, a worked Android/Gradle example (`java`, `gradle`, `node`, script writing under `REPOOS_ARTIFACTS_DIR`), native Linux/macOS and Docker setup with sudo-only steps identified, and the recommended engineer-session follow-up order (#0912 → #0913 → #0907). `user-docs/configuration.md` updated.
- **Tests**: a Tiao-shaped fixture project (separate root, own bundle, `./scripts/ci-remote.sh`) exercises native dispatch end to end; a fake-Docker CLI test executes the real `validate.sh` Docker branch and asserts the argv sequence and artifact output; shell-level regression tests execute the generated remote command and assert what the runner actually sees; pool queue/fallback tests cover command dispatch and multi-host queueing; Hetzner old-snapshot and native capture-cleanup regressions covered.

**Final verdict:** review pass 5 `good to go` (stale-evidence-only notes), close-out gate completed in 778s, status `done`, release `success`, merged commit `a1a33fe0bd1c66956f80706e190f238242cb315b`.

Not done / not claimed: no live Tiao checkout, Android SDK/Gradle host, device, real multi-host queue, or real Hetzner snapshot run. The final check passed remotely on the ThinkPad pool host (round 2: 570 test files, 8,113 passed, one skipped; round 3: 571 files; rounds 4–5: 566 files), but the environmental scenarios remain unexercised.

## Process stats

- **Wall clock:** created 2026-11-17T17:06:33Z → done 2026-11-17T23:30:50Z = 6h 24m 17s (derived from those two recorded timestamps).
- **Engineering rounds:** 5, all by the `codex` agent on model `gpt-6-luna`. The sessions table records one engineer session row (started 17:09:40.793Z, elapsed 1361s, 111,052,456 tokens, cost not recorded, status "finished" with the agent process exiting with an error); session rows for the other turns are not recorded.
- **Review passes:** 5, all by the `reviewer` agent on `opencode-go/deepseek-v4.1-flash`. Verdicts: passes 1–4 `needs some work`, pass 5 `good to go`.
  - Reviewer sessions recorded: 5, elapsed 269s / 557s / 701s / 478s / 332s (2,337s total), tokens 115,084 / 109,337 / 138,231 / 122,554 / 144,723 (629,929 total), cost 0.03955935 / 0.037046724 / 0.05466846 / 0.04486536 / 0.049338834 USD ($0.225478728 total).
- **Routing sessions:** 5 ("Model router (openrouter)", model unknown), 1s each; no tokens or cost recorded.
- **Restarts/swaps:** no agent or model swaps recorded; the engineer turn was ended/restarted three times without a handoff (see below), and one orphaned engineer process (pid 34750) was adopted at 21:53:02.
- **Handoffs:** `active→review` requested at 17:54:27, 19:04:51, 20:48:57, 21:07:48, 22:28:11 and 23:10:30; one handoff was deferred at 20:48:56 (queued message unread) and immediately re-requested.
- **Costs:** reviewer costs as above; engineer cost not recorded; total task cost not recorded.

## What went wrong

- **First turn ended without a handoff (17:20:58).** A queued message sat undelivered for 11 minutes while the engineer produced no output, so the turn was ended to deliver it. The turn's stderr also showed a Codex `apply_patch` verification failure (`Failed to find expected lines` in `src/core/types.ts`). Resolved by ending the turn; the message was delivered at 17:21:15 and the round-1 report followed.
- **Review pass 1 (18:00)** — Settings had no rendered controls for the new keys (schema registration alone is not enough, contra AGENTS.md's "every setting needs a UI control + test"); the Docker custom branch ran `--rm` without `--name "$CONTAINER"`, breaking hang-kill/teardown and artifact safety; the probe checked tools on sshd's non-login PATH while execution used `bash -lc` with Homebrew's PATH; no capability handshake for custom-command support; several docs sections contradicted the implementation. All fixed in round 2.
- **UI verification failed at 19:55:33** (3 issues): the shot highlight `#setting-remoteValidation.command` matched nothing and the click on the enable button timed out. Fixed in round 3 (dedicated Settings inputs, drawer shots); subsequent captures passed (21:00, 22:31, 23:13 — each 2 of 2 shots, clean console, 1 shot warning; the `.rvr-hosts` shot only ever showed the preview sandbox's "could not spawn ssh", a sandbox limitation, not a defect).
- **Second turn ended without a handoff (20:16:16)** after another undelivered 6-minute queued message; stderr showed Codex `write_stdin`/unknown-pid errors. At **20:48:56 handoff was deferred** because a queued message had to be read first; the engineer was resumed, read it, and re-requested handoff at 20:48:57. Two further queued-message holds and CTO completion nudges (19:00:39, 20:10:43) occurred around inactive stretches.
- **Review pass 2 (19:12)** — the generated remote command emitted `NAME=value …;` as an assignment-only prefix split by a semicolon, so *nothing* was exported to the runner script: the command, slot/container names, cache volume, image, profile and capture context all arrived empty; separately, Docker never passed `-e REPOOS_VALIDATION_COMMAND`, so `bash -lc ""` exited 0 — a false green. Fixed in round 3 with an `export` helper and a shell-executed regression test.
- **Review pass 3 (21:19)** — the `repoos-ci` image's `ENTRYPOINT ["/bin/bash","-lc"]` swallowed the appended `bash -lc` argv and exited 0 without running the script (false green again), the same shape in the Docker tool probe; `[validate] gate exit` was printed for every Docker code so an unstarted container looked like a project failure; `native` was wrongly published as a routing capability. Fixed in round 4 (`--entrypoint bash`, argv-observing fake-Docker test, gate-start marker, capability fix).
- **Review pass 4 (22:37)** — native capture worktrees leaked under `$HOME/.repoos-worktrees/<branch>` and broke repeat captures; reserved-code remapping (125/126/127, pre-gate exit 4) misclassified setup failures as project failures; unguarded Docker cache-volume setup; Hetzner (default provider) probed only mirror capability, so an old VM snapshot would silently ignore the command and run the stock Bun gate. All fixed in round 5. This pass also noted the reviewed HEAD's last two commits were un-reported (stale engineering report), resolved by round 5's report matching the reviewed tree.
- **Orphaned engineer process (21:53:02)** — pid 34750 was adopted; no further incident recorded.
- **Three `needs_input` markers** (21:19:36, 21:48:27, 22:47:48 around passes 3–4) corresponded to review messages being delivered; each resolved back to `active` work within minutes.
- **Pass 5 (23:15)** — `good to go`, stale-evidence-only; close-out gate passed first try (778s).

## Learnings

- **A config key is not usable until the Settings page routes and renders an editor for it.** Schema registration alone shipped zero user value in round 1. This is already an AGENTS.md rule ("every user-facing setting needs a Settings UI control + test") — the incident confirms enforcement belongs in review.
- **Test generated remote commands as shell programs, not text.** Both the semicolon-split env prefix and the Docker ENTRYPOINT false green passed string-assertion tests; only executing the generated command (fake runner script, fake Docker CLI recording argv) caught them. Worth carrying into `docs/agent-debugging-and-incidents.md` as a worked example alongside #0205/#0271/#0330.
- **Docker image ENTRYPOINT semantics are part of the command contract.** `docker run IMAGE bash -lc …` can be a successful no-op. A durable note belongs in `docs/remote-validation.md` (it is now baked into `--entrypoint bash`) and ideally a line in `docs/agent-debugging-and-incidents.md`.
- **Gate results need two independent signals** — a persisted gate-start marker plus the exit code — so reserved infrastructure codes never swallow project-defined ones, and vice versa. Encoding this in `docs/remote-validation.md` (where the exit-code contract is documented) would prevent regressions.
- **Probes must test the environment the execution shell actually sees** (login shell, PATH, HOME), not a different one; the same environment-mismatch class produced findings in passes 1 and 4 (Docker probe HOME vs run HOME remains an accepted edge case).
- **Script compatibility must be probed on every provider path**, not just the pool: Hetzner reused a mirror-only probe and would have silently run the wrong gate.
- **Per-run filesystem ownership: create all temporary worktrees under the run's cleanup root** so one trap owns the lifetime.
- **A non-RepoOS-shaped fixture is the test that catches portability bugs**; fixtures reusing this repo's root and Bun command passed while the original problem stood.

## Follow-ups

None recorded in Linked tasks. Two gaps noted in the record but not filed as tasks from this task's data: a live Android/Gradle (Tiao) run and a real multi-host/Hetzner custom-command run remain unexercised, and the non-blocking review suggestions (Hetzner capability cache holding `false` until restart; `selectValidateScriptCommand` preferring a leftover native script after a host is switched to `runner = "docker"`; Docker probe/run HOME mismatch) stand as known edge cases. The engineer-session follow-up ordering recommended in the docs (#0912 → #0913 → #0907, per #0904/#0907/#0912) predates this task.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
