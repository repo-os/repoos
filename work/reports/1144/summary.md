---
id: summary
title: summary
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: ""
---
## TL;DR

Tailnet server discovery on `repoos servers --tailscale` and the mobile Hub used Tailscale's display `HostName` as both the SSH target and the de-duplication key, collapsing distinct peers that shared a display name (two `omarchy` entries hid `bee` and `thinkpad`) and producing invalid SSH destinations for names with spaces or punctuation (`Peck’s Mac mini`). Discovery now derives the peer identity from the stable MagicDNS `DNSName`, keeps `HostName` as a separate readable `displayName`, skips mobile peers that cannot run a RepoOS server, and preserves the configured-host fallback, SSH argv shape, JSON compatibility and HTTPS URL mapping. One engineering round; two review passes (the first produced no verdict after an errored reviewer session, the second was "good to go"); the task landed and the release succeeded.

## Outcome

`src/core/tailnet-servers.ts` (shared by the CLI and `GET /api/servers/tailnet`) now normalizes `DNSName` through a DNS-label validator, uses its first MagicDNS label as `host`, and falls back to `HostName` only when that is itself DNS-safe. De-duplication and self-exclusion key on the MagicDNS identity, so distinct peers with the same display name no longer collapse. The readable `HostName` is carried as an additive `displayName` on success and unreachable rows and consumed by the mobile Hub. Mobile peers (`android`, `ios`, `ipados`, `tvos`, `watchos` per Tailscale's `OS` field) are filtered at parse time; explicitly configured hosts keep real SSH errors so genuine unreachable server-capable hosts stay diagnosable. `tailnetServerUrl` still prefers the full `dnsName`, so HTTPS mappings and the HTTP fallback are unchanged. The Hub's auth-refusal copy now explains that the native shell's WebView session is isolated from the shell's fetch, pointing users at the web Hub from the same origin or manual add.

Deterministic fake-based regression coverage was added for duplicate hostnames, punctuation/spaces in display names, MagicDNS names and unsupported mobile peers (no live tailnet or devices touched). Docs updated: `docs/mobile-architecture.md`, `docs/server-registry.md`, `user-docs/android-hub.md`, `user-docs/cli.md`.

Final verdict: **good to go** (review pass 2). Close-out gate completed in 748s; status recorded as done with `release:success`; merged commit `b21982f0ec7c3446882737f1ed24237e81b4a5e8`.

## Process stats

- Wall-clock start to done: 2026-11-17T02:38:50Z → 2026-11-17T03:58:49Z = 1h 19m 59s.
- Engineering rounds: 1 (engineer session started 2026-11-17T02:39:15Z, elapsed 1021s, finished; no restarts or model swaps).
- Review rounds: 2. Pass 1 (2026-11-17T03:01:08Z) recorded `incomplete — no verdict in report`; pass 2 (2026-11-17T03:05:05Z) recorded `good to go`.
- Agents and models: engineer and reviewer both ran as `opencode` agents on `opencode-go/deepseek-v4.1-flash`; the model-router sessions ran on an unknown model (not recorded).
- Sessions and spend (as recorded, unrounded):
- Engineer: 265,799 tokens, cost 0.07913479199999998.
- Reviewer (errored, pass 1): 47,226 tokens, cost 0.010700508000000001.
- Reviewer (finished, pass 2): 69,090 tokens, cost 0.024632255999999998.
- Recorded session totals across the three: 382,115 tokens, cost 0.114467556 (routing sessions recorded no tokens or cost).
- Shots: skipped — "Docs site skipped: no docs shot declared"; the reviewer confirmed no UI capture applied to this code/docs diff.

## What went wrong

- **Reviewer session errored on the first attempt.** A reviewer session started 2026-11-17T02:57:24Z errored after 224s (its 47,226 tokens and cost were still recorded), and review pass 1 was logged as incomplete with no verdict. Resolution: the reviewer was re-run starting 2026-11-17T03:01:17Z; pass 2 completed in 228s with verdict `good to go`. No engineering rework was needed.
- **Landing checklist "Main clean: FAIL"** was reported during review. The reviewer identified the cause as the pre-existing uncommitted `repoos.toml` on main — not a code defect on this branch — and did not re-run landing commands. Close-out subsequently succeeded.
- **Own-task-file merge WARN** noted by the reviewer; it was resolved from main at close-out and did not block landing.
- Review pass 2 flagged four non-blocking edge cases (see Learnings) and no bugs; none were fixed in this task and none were filed as tasks.

## Learnings

- A display name is not an identity: Tailscale's `DNSName` is the stable DNS-safe key and `HostName` is presentation only. Filtering at the parser — not at the SSH call site — is what stops a misleading failure from ever reaching the UI. This reasoning is captured in the round-1 report and the updated `docs/server-registry.md`.
- Optional additive fields (`displayName`) are the safe way to extend a discovery JSON contract without breaking older consumers.
- The Hub's auth story involves two separate sessions (native shell fetch vs. isolated WebView); error copy and docs must state this explicitly or users will retry a flow that cannot work from the shell. The signed-in-server requirement itself is a real integration limit, with the per-server native session already tracked as #0304.
- Review pass 2 left four unfiled edge-case observations worth carrying forward if tailnet work continues: the dedup key asymmetry when a peer has no `DNSName`; server-capable peers with no valid identity being silently dropped (MagicDNS disabled) instead of erroring; configured-host lookup not matching `displayName` or case-normalized keys; and `displayName` being peer-controlled text that should have control characters stripped before CLI printing. None of these were fixed or filed in this task.

## Follow-ups

None — no new tasks were filed as a result of this task (`Linked tasks: None recorded`).

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
