---
task: "1228"
pass: 2
at: "2026-11-19T13:12:45.200Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-cli-help-and-error-messages-matc
state: ok
tree_identity: "34bf65344:3f221c4e07"
---
## Verdict

`good to go` — code complete and correct; `STALE-EVIDENCE-ONLY`: the docs shot was captured on tree 3f221c4e0, reviewed HEAD is 34bf65344.

## Relevance

`still relevant` — the help-vs-docs drift and jargon errors the task targets are real, and this pass fixes them with a permanent drift-guard test.

## Evidence

None

## Bugs

None found

No further findings of this class were found after grepping: `src/commands/control-api.ts` (all remaining raw `api.request` sites: `review again`, `sync`, `summary`, `mv` handoff, `done` main path — each already requires a JSON `ok` field or a non-200 status, so a 200 HTML body fails them), `src/commands/tasks.ts` (list fallback checks `Array.isArray(body.tasks)`), all `requestOk` callers, `src/cli/repoos-api.ts`, no bare `node`/`npm`/`npx` anywhere in the diff.

## Edge cases

- Round 1 verified fixed: all six SPA-fallback-200 instances (`review keep`/`followup` moved to `requestOk`, which now refuses `htmlResponse` bodies; `integration`, `attention`, `done --cancel` share the exported `isHtmlResponse` guard) and the table-driven test drives each one to exit 1 with the plain message and no green `✓`. The server-side test pins the exact `No valid fields to update` string the `config set` rewrite keys on — the round-1 suggestion was adopted.
- `cmdDone`'s `integration-job` poll: a 200 HTML body there is neither 404 nor a job; it degrades to a poll-until-timeout rather than a clean message — unreachable in practice (server registers the route) and bounded by the deadline.
- `nonJsonResponse`'s 512-char doctype heuristic: a parse-failing non-HTML body still surfaces as raw text, by design.
- `cmdApi` checks `htmlResponse` with an inline cast instead of the exported `isHtmlResponse()` helper — behaviorally identical, style only.

## Suggestions

- The declared shot (`Docs site /cli`, highlighting `repoos checks timings / repoos checks slots`) was captured on tree 3f221c4e0 and is flagged STALE against reviewed HEAD 34bf65344. The intervening commits (`197b93a0`, `123050ee`, `bbdd932b`, `34bf6534`) touch only `docs/qa/`, tests, `src/cli/repoos-api.ts`, `src/commands/control-api.ts` and task bookkeeping — `user-docs/cli.md` is byte-identical since the capture — so the PNG (verified read: correct section highlighted, `repoos rm` in the sidebar, no horizontal overflow, clean console) still accurately depicts the reviewed tree. A re-capture on HEAD would silence the staleness flag mechanically if the human wants it.
- The QA report's finding table and the docs fence rebalance are faithful to the diff; no invented or impossible evidence claims were found (all probes are described as read-only GET/invalid-value calls, consistent with the diff).

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T12:52:49.788Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

