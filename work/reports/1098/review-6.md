---
task: "1098"
pass: 6
at: "2026-11-13T03:01:47.851Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/surface-why-an-agent-failed-expired-auth
state: ok
tree_identity: "58c4abe1f:1d8580e59"
---
Repeated review classes: Foreign `work/*` bookkeeping (passes 3–4) is healed — task-scope PASS. The pass-4 shot/`card:agentFailed` gap is fixed (#9999 fixture with `(CLI: …)` tail). `REPOOS_REMOTE_VALIDATION_DONE` child-env leak, `getAgentLastRuns` same-`startedAt` ties, and usage-limit `until` copy are fixed. Residual pattern: auth/model failures may still surface both deduped `agentFailure:<cli>` and per-session `providerFailure` rows — intentional, not spec-breaking.

## Verdict

`good to go` — Classifier, card/drawer disclosure, per-CLI bell dedupe/clear, Agents last-runs API/UI, crash-recovery copy, tests, and docs match the spec at `58c4abe`.

## Relevance

`still relevant` — Auth/model failures still hid in activity logs; this generalizes #1088 across CLIs without new runtime deps.

## Evidence

None

## Bugs

None found

## Edge cases

- Merge: only `work/1098-*.md` conflicts with `main` (close-out takes main’s copy); scope is #1098-only.
- `notifyAttentionAgentFailure` persists auth/model only; network/usage-limit use other paths; feed skips duplicate `providerFailure` rows for those ids.
- Handoff UI tree `1d8580e59`; HEAD `58c4abe` is bookkeeping/docs only — capture still matches `card:agentFailed` fixture and highlight on #9999.
- Round-5 engineering report’s generated file list looks foreign to this diff; implementation tree matches `git diff main...HEAD`.

## Suggestions (non-blocking)

- Optional blank line before `## Agent failure messages` in `user-docs/agents.md`.
- **Shot:** `default-1.png` — plain-language copy + collapsed “Raw CLI error” on fixture #9999; zero console errors per `1098.json`. No spawned bare `node`/`npm`/`npx` in the feature diff (`node:` imports in tests only).

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-13T02:59:05.977Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

