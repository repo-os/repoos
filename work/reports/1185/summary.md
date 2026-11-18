## TL;DR

Task #1185 fixed the "Restart now" button doing nothing on servers managed by systemd (and launchd) when the process title had been renamed to `repoos-<project>`. Detection no longer trusts the process name: it queries `systemctl status`, falls back to `/proc/<pid>/cgroup`, then to the parent process command, and now also runs those fallbacks when `systemctl` succeeds but only reports the generic `user@<uid>.service` manager. Restart of a supervised server goes through the service manager (`systemctl --user restart`, `launchctl kickstart -k`) instead of signalling the PID, the modal shows progress and surfaces errors, and preview fixtures make both states capturable. The QA note in `docs/qa/2026-11-releases-and-restart-qa.md` explicitly records that a real hand-run restart was **not** performed during the task. After 6 engineering rounds and 8 review passes the final verdict was **good to go** (pass 8); the close-out gate passed in 261s and the branch merged as `10ca5b44a9ee2096c2eafabea5ab2274483b3aa2`.

## Outcome

What shipped:

- **Supervisor detection** (`src/core/supervisor-detect.ts`): on Linux, the detector asks `systemctl status <pid>` first; when that fails *or* succeeds without a parseable service unit (e.g. it names only `user@1000.service`), it reads the process cgroup for a `.service` unit, then falls back to the parent command (`systemd --user`). A `com.repoos.serve.*` unit is classified as RepoOS-managed; an unrelated unit is external; if ownership can't be proven the result stays uncertain and automatic signalling is refused (fail-closed). On macOS, launchd detection via `launchctl` is retained; a shell-parented process remains hand-run. This directly addresses the bee report: a systemd user unit with a renamed process title was misdetected as hand-run.
- **Restart routing** (`src/core/server-restart.ts`, `server-restart-classify.ts`): detected systemd/launchd units are restarted by their manager using executable/argument arrays (no shell string, no PID signal), and the server waits for the replacement listener to come back healthy with a new PID. Failures return a direct error plus the manual command; a command that succeeds but leaves the server down reports that distinction.
- **UI** (`ReleaseUpdateNotification.vue`): the button enters a disabled "Restarting…" state after the server accepts the request, progress is cleared and the failure text is rendered if the request or restart fails; errors surface in the modal instead of it silently staying open.
- **Test coverage**: regression tests for the reported renamed-service scenario via cgroup and via systemd-parent fallback, for the `user@1000.service` success-but-unparseable branch, launchd, hand-run, restart command invocation, failure surfacing and timeout; shot fixtures `release:restartProgress` and `release:restartError` with a fixture-acceptance test.
- **QA note**: `docs/qa/2026-11-releases-and-restart-qa.md` records "Real restart check for #1185: not performed" — no live hand-run or supervised server was under test control, and no automated evidence is presented as a live restart.
- **Incidental fix**: the flaky `tests/servers-command.test.ts` Tailscale tests were made host-independent by injecting `httpDiscovery: async () => null` and disabling URL annotation.

Final verdict: review pass 8, **good to go**, 2026-11-18T19:18:29Z; close-out gate completed in 261s; status `done→done, release:success`; merged commit `10ca5b44a9ee2096c2eafabea5ab2274483b3aa2`.

## Process stats

- **Engineering rounds:** 6 (all agent `codex`, model `gpt-6-luna`), at 14:08, 14:43, 15:52, 17:34, 18:45 and 19:17 UTC.
- **Review passes:** 8 (all agent `reviewer`, model `gpt-6-luna`). Verdicts: passes 1–3 needs some work, pass 4 good to go, passes 5–7 needs some work, pass 8 good to go. Four passes ended in `needs_input`; pass 7's was cleared for review again by the human at 19:17:33Z.
- **Wall-clock:** created 2026-11-18T12:27:18Z, done 19:23:39Z — roughly 7 hours total; from the first `active` start at 13:17:35Z it is about 6 hours 6 minutes (derived from the recorded timestamps). First review landed at 14:08:58Z, about 51 minutes after the engineer started.
- **Agents and models:** engineer — `codex` on `gpt-6-luna`; the sessions table records one engineer session started 13:17:35Z with elapsed 3296s (~55 min) that finished with a Codex CLI error; the six rounds were resumes of it with watchdog restarts in between. Reviewer — `reviewer` on `gpt-6-luna`, 8 recorded sessions of 29s–70s each. Debugger — `debugger` on `opencode-go/deepseek-v4.1-flash`, 3 short sessions (3s, 11s, 12s) around 16:18–16:37 during the close-out repair. Model routing — `openrouter` router sessions (model not recorded), each ≤1s.
- **Watchdog restarts of the engineer:** 6 (13:57, 14:22, 14:47, 17:00, 18:04, 18:15), each because a queued message waited 3–4 minutes with no live process. Orphaned engineer pids adopted 3 times (pids 6817, 34241, 35960).
- **Tokens:** engineer session 112,249,509 tokens; the 8 recorded reviewer sessions sum to 2,990,999 tokens (439,199 / 498,903 / 441,843 / 561,351 / 322,282 / 317,877 / 147,850 / 261,694). Debugger and routing token counts are not recorded.
- **Cost:** not recorded — every cost field in the sessions table is blank.

## What went wrong

1. **First handoff failed (13:53:49Z)** — remote validation failed with 3 test failures in `tests/servers-command.test.ts` (`repoos servers --tailscale`) on thinkpad. Cause: the tests mocked the SSH command but left real HTTP peer discovery enabled, so they hit actual Bee servers. Fixed by injecting a null `httpDiscovery` and disabling URL annotation; the focused file then passed.
2. **Second handoff failed (15:01:55Z)** — `tests/shot-fixtures.test.ts` fixture "accepts the restart progress and error dialog fixtures (#1185)" failed on mini. The declared shots weren't accepted as dialog captures because the fixtures weren't registered in the shared shot-fixture catalog. Fixed in round 3 by registering both fixtures and extending the dashboard digest's restart-fixture handling.
3. **Review churn on evidence, not code (passes 1–3)** — the handoff capture showed Mission Control instead of the restart notice, so it verified nothing about the button. Resolved by adding seeded fixture states and declaring two shots on `/` highlighting the notice; pass 4 then said good to go.
4. **Close-out repair (16:37:15Z)** — after pass 4's good-to-go, close-out sent the task back to `active` with reason `gate-failure`; three debugger sessions ran. Pass 5 then found a real bug class: detection could classify a unit as managed but `classifyRestartPath` still returned `refuse-supervised-unknown` when the registered service didn't match, and external supervisors were "restarted" by stopping the PID and hoping for a respawn. Fixed in round 5 by carrying unit identity/scope through detection and routing restarts through the manager.
5. **Detection fallback gap (pass 6)** — the cgroup/parent fallbacks ran only in the `systemctl` `catch` branch; a successful but unparseable status (`user@1000.service`) returned `uncertain` without checking the cgroup. Fixed in round 6 by running the shared fallback on inconclusive success too, with a regression test.
6. **Stale captures (pass 7)** — both declared shots were captured on an earlier tree, not reviewed HEAD; re-capture cleared it (pass 8). One earlier shot attempt failed outright ("browser capture cancelled", 14:30:22Z) and was retried successfully later.
7. **Unfinished merge in the worktree** — a prior handoff attempt left `MERGE_HEAD` with all conflicts resolved but unrelated main files staged, blocking the partial checkpoint commit ("cannot do a partial commit during a merge"). Round 4 used `git merge --abort`; round 5 used `git merge --quit` to clear stale merge metadata while preserving the index. Relatedly, `git merge-tree --write-tree` couldn't run in passes 6–8 because the environment denied temporary-file creation; the landing checklist confirmed only the task's own work-file conflict, which close-out resolves.
8. **Engineer turns ending without handoff** — three times (13:28, 14:52, 15:48) the engineer's turn exited cleanly without requesting review in order to deliver queued messages; watchdog restarts and queued-message resumption handled delivery. The Codex CLI also logged errors: an `apply_patch` invalid-hunk failure at 13:18 and repeated "Custom tool call output is missing" errors between 14:52 and 15:49.
9. **Board/worktree status mismatch** — at round 2 the worktree's task copy said `review` while the live board said `active`; the engineer continued on the branch without editing metadata, and round 3 explicitly returned the task to `active` via the CLI before editing.

## Learnings

- **A process title is not evidence of how a server started.** Ownership must come from OS supervisor metadata — cgroup membership, verifiable parent, `INVOCATION_ID` — and unknown ownership must stay unknown rather than defaulting to hand-run. Durable rule candidates for `AGENTS.md` / a docs note (the branch itself already added a line to `AGENTS.md` and `docs/agent-ui-and-preview-conventions.md`; where else this should be recorded is not stated in the facts).
- **Fallback logic must trigger on inconclusive success, not only exceptions.** `systemctl status` can exit 0 while naming the enclosing `user@<uid>.service`; treating "command succeeded" as "answer found" silently bypassed the fallbacks. Passes 6–8 repeatedly flagged this as a *recurring pattern* ("fallback logic runs only when a command fails") and recommended a human look for it elsewhere in the codebase — that sweep has not been filed as a task.
- **Restart a supervised process through its manager, never by signalling the PID**, and verify recovery through the service's health endpoint with a new PID. Detection should return enough structure (platform, unit, scope) to execute the right operation later.
- **Mock every I/O channel a function uses.** Mocking SSH while leaving real HTTP discovery on made tests depend on the developer machine's tailnet.
- **Review evidence must force the conditional UI state it claims to verify** — a generic `/` capture can be healthy and console-clean while showing an unrelated page; fixtures must be registered in the shared catalog to count as dialog captures.
- **QA notes must separate automated coverage from observed live behavior.** No live restart was performed here, and the record says so; unit tests are not operator evidence.
- **Stale merge metadata (`MERGE_HEAD` with a resolved index) blocks WIP checkpoint commits** even when there is no real conflict; `git merge --quit` (keep tree) vs `--abort` (discard) is the distinction that mattered.

## Follow-ups

None filed — Linked tasks: none recorded. Two observations from the process that were *not* turned into tasks and may deserve one: (1) the reviewers' recurring flag that fallback logic elsewhere may run only on command failure (passes 6–8); (2) live operator verification that Restart now works on a real systemd-managed server (e.g. bee) — the QA note records it as not performed.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
