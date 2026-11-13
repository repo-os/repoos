---
task: "1098"
pass: 1
at: "2026-11-12T13:46:25.246Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/surface-why-an-agent-failed-expired-auth
state: ok
tree_identity: "2b9826efa:e1fb918dd3"
---
## Verdict

`good to go` — Classifier, task surfaces, per-CLI notices, Agents last-runs, crash-recovery copy, tests, and docs meet the spec; UI shot shows the failure banner and CLI disclosure.

## Relevance

`still relevant` — Board visibility for auth/model failures was still missing; this centralizes classification without duplicating shipped Copilot enrichment.

## Evidence

None

## Bugs

None found

## Edge cases

- `clearAttentionAgentFailure` runs on any clean exit for that CLI before escalation; failed exits still raise notices first.
- Board notices intentionally skip usage-limit and transient network classes (separate usage-limit path).
- `getAgentLastRuns` could return two rows per role if two sessions share the same `startedAt` timestamp.
- Usage-limit copy does not preserve “until HH:MM” from provider text (generic sentence only).

## Suggestions

- Re-capture optional Agents-page last-runs row when convenient; not declared in shots.
- Fix `user-docs/agents.md`: use `## Agent failure messages` (not a second `#`), mention bell notices and card disclosure, not only transcript.
- Consider extracting reset time into usage-limit summaries when the tail includes it.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-12T13:44:55.287Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

