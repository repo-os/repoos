---
task: "1098"
pass: 5
at: "2026-11-12T18:57:25.442Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/surface-why-an-agent-failed-expired-auth
state: ok
tree_identity: "b374a6bb8:3828b0a55"
---
## Verdict

`good to go` — Classifier, card/drawer disclosure, per-CLI bell dedupe/clear, Agents last-runs API, crash-recovery copy, tests, and docs match the spec.

## Relevance

`still relevant` — Failures still hid in the activity log; this generalizes #1088 across CLIs without new runtime deps.

## Evidence

None

## Bugs

None found

## Edge cases

- Server landing: only `work/1098-*.md` conflicts with `main` (close-out takes main’s copy); task-scope diff is #1098-only — foreign-bookkeeping class from passes 3–4 is healed.
- `notifyAttentionAgentFailure` only persists auth/model (`network`/`usage-limit` use other paths); matches tests and dedupes `providerFailure` rows for those ids in `attention.ts`.
- Handoff UI tree `3828b0a55`; HEAD `b374a6bb8` is bookkeeping after the `card:agentFailed` fixture fix — shot still valid.

## Suggestions (non-blocking)

- Optional blank line before `## Agent failure messages` in `user-docs/agents.md`.
- Non-auth/model errored runs may still show per-session `providerFailure` bell rows alongside deduped `agentFailure:<cli>`.
- **Shot:** `default-1.png` shows fixture **#9999** with plain-language copy and collapsed “Raw CLI error”; yellow highlight on `.tc-needs-detail`; drawer is **#1098** Changes. Zero console errors in handoff evidence. No bare `node`/`npm`/`npx` spawned in the feature diff.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-12T18:56:16.096Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

