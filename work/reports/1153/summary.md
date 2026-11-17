## TL;DR

Task #1153 replaced the Hub's SSH-pairwise tailnet discovery with a machine-level HTTP discovery listener bound to each machine's Tailscale address, with SSH kept only as a fallback for older servers. Bare machine rows are gone from the project list, phones and tablets are filtered out, failed checks moved into a collapsed "Couldn't check these machines" group with plain reasons ("SSH is off on muse"), and machines hosting saved servers now resolve to their saved entries. It took 5 engineering rounds and 6 review passes (5 × "needs some work", final "good to go") on 2026-11-17, roughly 7 hours created-to-done. The run was rough at the start (five failed engineer starts on an unauthenticated Cursor pairing) and the branch landed only after four failed handoff attempts. No live-tailnet or real-phone validation happened; the final review verdict was explicitly stale-evidence-only on the UI capture.

## Outcome

The Hub's "Find servers on my tailnet" screen no longer lists Tailscale machines as unreachable pseudo-rows. What shipped:

- Each RepoOS server now runs a small machine-level discovery listener bound directly to its Tailscale IPv4/IPv6 address on a fixed discovery port (41641), serving project name, port and HTTPS Serve URL — no SSH keys, no auth cookies, no checkout paths in the response. Access control comes from the actual socket address being inside Tailscale's ranges, not from client-supplied headers; `tailnetDiscovery` is enforced per registry row, so whichever project owns the port can't overrule a sibling's opt-out.
- The asking server probes online peers over plain HTTP inside the WireGuard transport in parallel, with an extended per-host budget (25s whole-pass deadline replacing the shared 8s that turned healthy-but-slow hosts into "timed out"). Older servers without the listener still work through the SSH fallback, and failures map to specific reasons ("no SSH key from thinkpad", "SSH is off on muse").
- Device filtering now uses peer OS, mobile Tailscale tags and device-model patterns (e.g. "Nothing Phone (3a)") across both HostName and DNSName, without excluding a server legitimately named like "phone-01".
- Mobile merge logic reconciles unreachable rows against saved servers (by exact URL, or by name when uniquely matched on both sides), so a saved machine shows as saved instead of unreachable; two projects behind one Serve host stay distinct because identity is the full URL with path, not the origin.
- `repoos servers --tailscale` shares the same `src/core/tailnet-servers.ts` implementation and prints the same reasons; user docs, `docs/mobile-architecture.md`, `docs/server-registry.md` and `mobile/README.md` were updated.

Final verdict: review pass 6 returned **good to go** (noted as STALE-EVIDENCE-ONLY — the one UI capture was stale and showed the desktop surface, not the changed mobile Hub). Close-out gate completed in 119s; merged as commit 31a0f452, status done with release:success.

Honest caveat carried forward from the round reports and reviews: everything is proven by fake-HTTP/fixture tests; nobody ran this against Nick's real tailnet or phone in this task.

## Process stats

- **Wall-clock:** created 2026-11-17T10:06:23Z → done 17:12:22Z = 7h 5m 59s.
- **Engineering rounds:** 5 (all codex · gpt-6-luna).
- **Review passes:** 6 — passes 1–5 "needs some work", pass 6 "good to go".
- **Engineer:** started on cursor + composer-2.5 (a human-set override pinned by crash recovery) — 5 failed starts with an authentication error between 10:23 and 10:44; a cli/model override at 10:53:30 moved it to codex + gpt-6-luna. The recorded gpt-6-luna engineer session ran 7,422s with 382,023,679 tokens; its cost is not recorded, and the five composer-2.5 sessions recorded no tokens or cost.
- **Reviewer:** opencode-go/deepseek-v4.1-flash, 6 sessions, total 1,942s (32m 22s), 652,776 tokens (28,88 / 69,446 / 114,844 / 122,343 / 174,978 / 168,277 per pass), total cost $0.2122 (sum of the six recorded session costs: 0.003077364 / 0.03332841 / 0.036795564 / 0.044206806 / 0.05080287 / 0.04396647).
- **Debugger:** 3 short sessions (3–10s, deepseek-v4.1-flash), tokens and cost not recorded.
- **Restarts/swaps:** 4 watchdog restarts of the engineer (10:33, 10:44, 13:10, 14:27 — mostly queued messages waiting with no live process), one model swap, and several orchestrator-ended turns whose only purpose was delivering a queued message.
- **Combined recorded cost:** $0.2122 reviewer total; engineer cost not recorded, so no total is stated.

## What went wrong

- **Five failed engineer starts (10:23–10:44):** cursor + composer-2.5 errored with "Authentication required" every time. Crash recovery correctly *surfaced* instead of switching because the pairing was a human-set override pinned to the task; a watchdog retried twice more into the same wall. Resolved only when the override was changed at 10:53:30 (→ codex + gpt-6-luna). Cost: ~30 minutes of dead time.
- **Handoff failed four times:** (1) 13:30 — `repoos check` failed on tests (stale expectations); (2) 13:49 — engineering report draft missing (`.repoos/engineering-report-drafts/1153.md`); (3) 16:38 — remote validation failed on an unrelated test (`check-docs-only-cli.test.ts`, cmdCheck classification on thinkpad); (4) 17:01 — could not auto-retry after a check failure because the worktree already had a recorded live engineer pid. The last one resolved itself: review pass 6 still returned good to go and close-out proceeded.
- **Environment-dependent test:** the E2 `resolveServeHost` test assumed Tailscale was absent, but the machine has a live Tailscale IP, so `resolveServeHost(undefined)` correctly returned `0.0.0.0` against an expected `127.0.0.1`. Fixed by making the host detector injectable and having the test model both branches deterministically (task #1143 had separately landed its own fix for the same test on main).
- **Six stale assertions** still encoded the old 4s SSH timeout and old saved-row behavior; updated alongside the implementation.
- **Interrupted merge state:** round 5 found an active `MERGE_HEAD` with no unresolved paths and many staged main changes; cleaned with `git merge --quit`, preserving the merged index. Also, RepoOS had marked tracked files read-only after an earlier handoff attempt while the task was still active; permissions were restored on the specific files.
- **Tool-level Codex errors throughout:** `apply_patch` verification failures, failed file writes, and a rejected `rm -f` command (safety policy). Each was worked around inside the session; none blocked the branch.
- **Flaky-looking suite behavior:** one failing test passed in isolation (1 passed, 16 skipped), diagnosed as a suite-load timeout rather than a regression; the engineer reran the full changed-path check for a green result (final retry: all 739 test files, 9,902 tests, 14 skipped, plus UI smoke, contrast audit and user-docs build).
- **Evidence quality:** the declared shots were repeatedly skipped for the Docs site, one capture was cancelled at 17:01:48, and the single capture that existed (desktop Mission Control, tree `867c4d346` ≠ HEAD) never showed the changed mobile screen. The final verdict explicitly rides on code review + tests, not visual evidence.

## Learnings

Durable ones (several already written into the repo's docs during the task):

- **Tailnet identity must come from the transport, not headers.** Client-supplied `Tailscale-User-Login` and loopback+`X-Forwarded-For` patterns are spoofable and exclude tagged nodes; binding a listener to the Tailscale interface makes the socket address the trust anchor. Recorded in `docs/mobile-architecture.md` — worth a line in `docs/agent-debugging-and-incidents.md` as a general "don't authenticate via forwardable headers" precedent.
- **Machine-level listener, project-level policy.** When several projects share one machine (and one port), config ownership must follow the registry row, not whichever process won the bind. Captured in `docs/server-registry.md`.
- **Origin-only identity silently collapses projects.** Serve maps multiple projects by path; reducing URLs to origins broke saving, health checks and dedup. General rule: carry the full normalized URL through every consumer.
- **Nested timeout caps must be reviewed together.** Raising an HTTP probe cap did nothing while an outer per-host wrapper truncated it; tests should assert the actual call budget, not just outcomes.
- **Environment-sensitive tests should inject the detector** rather than assume the host lacks Tailscale — this fits the existing "works here, fails there = environment difference" rule in AGENTS.md's debugging section; `docs/agent-debugging-and-incidents.md` is the natural home for this worked example.
- **Watch the docs-drift pattern.** Six review passes in a row each found at least one docs/behavior contradiction (HTTPS-vs-plain-HTTP wording, stale SSH failure reasons, an outdated "no project paths" claim). Pass 6 flagged this as a recurring pattern a human should watch; one instance (`docs/server-registry.md:107-108` now contradicts the restored `root` field) is still open — a candidate for the docs-staleness sweep described in AGENTS.md.

## Follow-ups

None filed — the activity record shows "Linked tasks: None recorded." Loose ends the final review left as non-blocking suggestions, worth filing as small tasks: re-capture a declared mobile-Hub discovery shot (plus a failures fixture) on the final tree; fix the stale `docs/server-registry.md` claim about project paths; drop the unused `originOf` export; distinguish "no projects running" from an explicit opt-out in the disabled response; consider a listener test that actually binds and probes the real socket; and a real-device pass on Nick's tailnet, which no fixture substitutes for.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
