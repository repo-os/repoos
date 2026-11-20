## TL;DR

Task 1256 fixed the remote-runner add/test/remove flows so every failure mode (unreachable host, wrong user, missing CLI, slow response, broken Docker, unwritable cache) reports a plain-English cause and next step instead of a raw `FAILED (exit 255): ssh: …` line. Probes now run in parallel, per-host output is preserved under a Details block, and removing a host from the pool requires confirmation. Two engineering rounds; the first review found one real classifier-ordering bug (unanchored `Permission denied` pattern), which round 2 fixed. Verdict went from "needs some work" to "good to go"; merged as `30bd3f95` and released. One unresolved process question was left for the human: the repo's own pre-review gate runs the test suite over ssh on the configured `thinkpad` runner, while this QA task's acceptance criteria forbade ssh — no task was filed for it.

## Outcome

The remote-runner drawer and its server route now behave as the task asked:

- A new `describeHostProbeFailure` classifier in `src/server/remote-validation.ts` maps each failed probe to a named failing host, a plain-English cause, and a next step. It covers: probe timeout, login refused for the wrong user, unresolvable hostname, refused or timed-out connections, Docker missing or stopped, git or bun missing from the login PATH, runner image missing or missing a tool, unwritable Bun cache, and (added in round 2) missing or outdated runner script. Anything unrecognized gets a generic line pointing at the details. The Test headline names the failing hosts.
- The raw ssh/probe output, which the drawer previously discarded on failure, is now shown under a Details block alongside the headline.
- Host probes run with `Promise.all` instead of sequentially, so three unreachable hosts cost one bounded wait, not three; the drawer tells the user a non-answering host is reported after 15 seconds.
- Removing a host now shows an inline confirmation panel ("Remove mac1 from the host pool? …") before anything is saved; "Keep it" restores the saved list, and editing the input clears a pending removal. Saving with the pool status unknown is refused (defensively — the editor is hidden in that state, and a test pins that).
- The two Hetzner config messages were reworded to say where to set the value, and the VM listing call is wrapped so a raw API error gets a plain next step.
- Tests: `remote-probe-failures.test.ts` (table-driven over the probe's literal messages, pinning the wording the classifier matches) and `remote-runner-flows-qa-browser.test.ts` (real drawer mounted in jsdom for add/test/remove, plus WebKit renders of failure and confirmation states at 375, 768 and 1280 px asserting no widening, no off-viewport content, and the plain-English text). The QA report is committed at `docs/qa/2026-11-runner-flows-failures-qa.md`.
- `repoos.toml` was not touched, per the task note.

Final verdict: review pass 2 was `good to go`; the task reached `done` with `release:success` (merged commit `30bd3f95ebb440709f066c307acfae1a79e55377`).

## Process stats

- **Rounds:** 2 engineering rounds, 2 review passes (pass 1 `needs some work`, pass 2 `good to go`).
- **Wall-clock, created → done:** 2026-11-20T00:07:05Z → 2026-11-20T02:49:35Z = 2h 42m 30s.
- **Engineer:** Claude Code on `haiku` — one engineer session, elapsed 2768s, 82872 tokens, cost $3.0021160999999994.
- **Reviewer:** `opencode` on `opencode-go/glm-5.3-flash` for both passes — pass 1: 85s, 55660 tokens, $0.021229929999999998; pass 2: 81s, 52245 tokens, $0.01710122.
- **Routing sessions:** "Model router (jev)", model unknown, 0s elapsed, no tokens or cost recorded (two instances).
- **Totals:** 190777 tokens across the three agent sessions; total cost $3.04044725 (sum of the three recorded costs).
- **Restarts/swaps:** no model swaps. One orphaned engineer process (pid 44870) was adopted at 00:17:10; five orphaned `sleep 60` run processes (pids 33275, 33964, 34115, 35016, 39397) and one orphaned `repoos check --changed main` process (pid 95245, age 7m) were stopped by the system during the run.
- **Gate durations where recorded:** round-1 scoped check passed in 503s on the remote runner, round-2 in 888s (engineer-reported); the close-out gate completed in 823s.

## What went wrong

- **Classifier ordering bug (review pass 1).** The login-failure rule matched any `Permission denied` unanchored, so remote-side output like `touch: …: Permission denied` on an unwritable Bun cache was misreported as an ssh login failure — the exact failure class the task set out to explain. Fixed in round 2: the rule now matches only ssh's `user@host: Permission denied (publickey…)` shape, and the probe's own fixed messages are checked first. Pass 2 verified the fix and found no further defects.
- **Acceptance-criteria conflict with the repo's own gate.** The task said headless Playwright only against fixtures, no ssh, no changes to real runners. But the required pre-review `repoos check` has remote validation enabled in `repoos.toml`, so each scoped check run uploaded a bundle to the configured `thinkpad` runner and ran the suite there over ssh (503s in round 1, 888s in round 2). The engineer did not address any host directly and left the question to the human; it was not resolved during the task and no task was filed for it.
- **Orphaned processes.** An orphaned engineer process was adopted early (00:17:10). Later, six orphaned run processes (five `sleep 60`, one `repoos check --changed main` that had been running 7 minutes) were stopped between 01:08 and 01:30. All resolved by system cleanup; no work was lost.
- **Held nudges / queued-message churn.** Three CTO nudges were held (twice "handoff gate is running", once "an undelivered message is already queued"). A message queued at handoff was ultimately discarded at 02:47:18 because the task was already done.
- **Ambiguous round-2 check output.** The engineer's round-2 output read "All checks passed" but contained an interim `✗ check-fmt:check` line. A direct `bun run fmt:check` on the same tree passed; it was treated as transient gate output and left unresolved.
- **No `## Shots` declared.** Both review passes noted the handoff capture showed the dashboard rather than the changed UI. The engineer's reason: the failure block needs a live Test probe and the confirm panel needs a pool save, both off-limits for this task. The gated WebKit render tests stand in as the width/layout evidence; both reviewers accepted this, while suggesting a `state`-fixture shot as a future improvement.

## Learnings

- **Test a message and the code that produces it together.** The probe's literal strings now sit in the classifier's test table, so rewording either side fails the suite loudly instead of degrading quietly. This is a reusable pattern for any user-facing failure mapping.
- **Match the shape of the source, not a word inside it.** `Permission denied` appears in remote-side output too; unanchored patterns on stderr text misclassify. Fits the debugging guidance in `docs/agent-debugging-and-incidents.md` (read the actual bytes before pattern-matching them).
- **Fixture fidelity beats exemptions.** A false overflow came from a test stub omitting `.drawer-wrap` (which the real dialog adds and which hides the resize handle at ≤600px); the fix was to make the stub match the app, not to exempt the element.
- **Check the raw markup path when screenshotting fixture output.** `wrapper.html()` pretty-prints and injects whitespace inside `pre-wrap` text the app never produces; render with `outerHTML` instead.
- **Process question worth deciding before the next QA task:** tasks whose acceptance criteria forbid ssh cannot run the standard pre-review gate when remote validation is enabled in `repoos.toml`. Whether future QA runs need a fixture runner or a gate-skip path is an open human decision — if adopted as policy it belongs in `docs/agent-workflow-rules.md` or a short ADR, not just this report.
- **Treat contradictory gate output as suspect.** A "passed" gate with a visible `✗` line was resolved only by running the failing step directly; the ambiguity was never root-caused.

## Follow-ups

None — no linked tasks were recorded. Two items were left explicitly for the human rather than filed as tasks: (1) the ssh-vs-QA-acceptance-criteria conflict with the remote gate described above, and (2) real-host confirmation that the new failure wording matches what ssh actually prints on the live network (all test evidence is fixture-based; the QA report leaves real-host evidence blank).

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
