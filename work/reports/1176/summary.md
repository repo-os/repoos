## TL;DR

Task 1176 was a docs-only QA pass checking user documentation for Hub apps, Releases, remote runners and per-project check settings against current behavior. One engineer round found and fixed one stale page: `user-docs/remote-engineers.md` still described ADR 0009's proposed remote engineer sessions as shipped, including configuration the product doesn't read (`[remoteEngineers]` blocks, placement options). The page was rewritten to document what actually exists — `remoteValidation.engineerSelfCheckRemote`, which sends install/build/test work to a validation runner while the engineer process, CLI and worktree stay on the RepoOS host. A QA record was added at `docs/qa/2026-11-user-docs-accuracy.md`. All other requested topics (macOS Hub, Android Hub, tailnet discovery, Releases, check docs) were verified accurate with no changes needed. One review pass, verdict "good to go"; merged as commit `e5203b6de932c9534f2af72c8435aa2d00d87d8e`. No product bugs found, no follow-ups filed.

## Outcome

Shipped (docs only, no application code changed):

- **`user-docs/remote-engineers.md` rewritten** (+48/−97). Replaced the ADR-era forward-looking description — which warned that remote engineer sessions were "designed but not built" while presenting unusable `[remoteEngineers]` configuration — with the shipped boundary: a configured validation runner can perform the install/build/test portion of an engineer's self-check when `remoteValidation.engineerSelfCheckRemote` is on (default enabled when remote validation is enabled; setting it false returns the full self-check to the RepoOS host). Format and lint stay local. The engineer CLI, task worktree and engineer subprocess remain on the machine hosting RepoOS. The page keeps its title as a landing place for users searching for remote execution, but the first paragraph now directly answers that the managed engineer process itself is not remote today.
- **`docs/qa/2026-11-user-docs-accuracy.md` added** (+42/−0), listing the concrete change, the reviewed topics with no-change findings, and stating that no implementation bug was found and that no device-specific testing was run.

Verified accurate, no changes: the macOS Hub page (manual stable-release check, six-hour result cache, explicit recheck, browser-based download flow); the Android Hub page (APK updates and signing, tailnet peer queries via a saved server, HTTPS requirement for remote server URLs — the phone does not scan the network itself); tailnet discovery docs (`tailnetDiscovery` on by default, applied per project independently); the check documentation (project-owned `[[check.steps]]`, changed-path behavior, remote engineer self-check); and the Releases documentation (release checks, prerelease handling, release-note drafting, publish safeguards, distribution destinations).

**Final verdict: good to go** (review pass 1, 2026-11-18T05:53:33Z).

## Process stats

| Metric | Value |
| --- | --- |
| Created | 2026-11-18T05:49:21Z |
| Done | 2026-11-18T05:59:36Z |
| Wall-clock, start to done | 10 min 15 s |
| Engineering rounds | 1 |
| Review passes | 1 (verdict: good to go) |
| Restarts or model swaps | none recorded |
| Status review at | 2026-11-18T05:53:04Z |
| Close-out gate | completed in 170 s |

Agents and models per role (from the sessions table; token costs not recorded):

| Role | Agent | Model | Elapsed | Tokens |
| --- | --- | --- | --- | --- |
| engineer | engineer | gpt-6-luna (codex) | 137 s | 940,726 |
| reviewer | reviewer | gpt-6-luna (codex) | 27 s | 185,741 |
| routing | Model router (openrouter) | unknown | 1 s | not recorded |
| routing | Model router (openrouter) | unknown | 1 s | not recorded |

Total tokens recorded across engineer + reviewer: 1,126,467. Cost: not recorded for any session.

## What went wrong

- **CTO nudge / held task at 2026-11-18T05:52:12Z** — "held — handoff gate is running." The handoff gate was still executing when the hold fired; it resolved on its own, and status moved to review at 05:53:04Z. No intervention was needed.
- **Shots skipped** — "Docs site skipped: no docs shot declared." Expected for a docs-only task; the reviewer confirmed no UI capture applies. Not a defect.
- No crashes, stalls, failed gates or flaky checks were recorded. The review pass found no bugs, and both automated-verification items (browser console-error check, guard negative-test evidence) were skipped as not applicable to this docs-only branch.

## Learnings

- **Distinguish where the agent process runs from where its validation gate runs.** "Remote runners" cover validation checks and browser evidence, not remote execution of the engineer process itself. This was the exact confusion the old `remote-engineers.md` embodied. This is durable and belongs in `user-docs/remote-engineers.md` (now fixed) and worth a line in `AGENTS.md`'s remote-runner section if agents ever misread the boundary the way the old doc did.
- **Document a setting's default only in the context where it applies.** `engineerSelfCheckRemote` defaults to enabled *when remote validation is enabled* — stating the default without that condition invites misreading. The rewritten page makes this explicit.
- **Docs QA passes are strongest when each user-facing claim is paired with its code owner** — config parsing/defaults for settings, server orchestration for where checks run, UI components for what the Hub shows. Using narrow heading/keyword searches on large reference manuals instead of full reads kept a multi-topic verification inside a single 137-second engineer round. Worth noting in `docs/` if other QA-docs tasks recur.
- **The QA record should state its verification limits** — this pass was a source-backed behavior check, not device QA. The committed `docs/qa/2026-11-user-docs-accuracy.md` says so, so later readers don't over-trust its scope.

## Follow-ups

None — Linked tasks: none recorded, and the pass identified no product bugs requiring a filed task.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
