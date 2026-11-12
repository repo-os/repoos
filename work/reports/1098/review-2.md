---
task: "1098"
pass: 2
at: "2026-11-12T16:06:28.183Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/surface-why-an-agent-failed-expired-auth
state: ok
tree_identity: "1a337d0f2:16e9a85ca6"
---
## Verdict

`needs some work` — Feature code and tests meet the spec; close-out is blocked until `work/1075` bookkeeping is healed and main merges clean.

## Relevance

`still relevant` — Centralized failure classification and per-CLI bell notices address a real board-visibility gap that #1088’s Copilot-only path did not cover.

## Evidence

None

## Bugs

None found

## Edge cases

- Server landing preflight: `work/1075-tell-the-user-when-an-installed-upgrade-.md` still differs from main (scope + merge conflict); `repoos sync 1098` should heal before Move to done.
- `getAgentLastRuns` can return two rows per role if two sessions share the same `startedAt` (unchanged from pass 1).
- Bell still gets per-session `providerFailure` items alongside deduped `agentFailure:<cli>` for auth/model.
- Failover activity points users to the Agents page; bell items for the same failures link to `/agents` via `attention.ts`.

## Suggestions

- Re-run `repoos sync 1098` and re-request review so landing preflight passes.
- Optional Agents-page last-runs capture (not declared in shots).
- Add a blank line before `## Agent failure messages` in `user-docs/agents.md` for sidebar spacing.

**Shots:** `default-1.png` (tree `16e9a85`, current for `1a337d0`) shows fixture task **#9999** with plain-language failure copy and a “Raw CLI error” disclosure on the card; drawer is #1098 Changes with fixture “No code changes yet.” Zero console errors in handoff evidence. Pass 1 doc/`until` items are fixed in round 2. No bare `node`/`npm`/`npx` in the task diff.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-12T16:04:22.858Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

