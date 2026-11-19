---
task: "1242"
pass: 1
at: "2026-11-19T19:33:03.302Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-hub-server-picker-and-add-server
state: ok
tree_identity: "a633eca86:"
---
## Verdict
`needs some work` — one sibling error display still lacks the screen-reader announcement this pass standardizes.

## Relevance
`still relevant` — the add-flow copy and refusal rules were genuinely broken (unsafe schemes fetched, non-RepoOS pages savable) and this diff fixes them correctly.

## Evidence
None

## Bugs
- **Class: screen-reader error announcement** — `mobile/src/components/TailnetDiscoveryView.vue:70` — the discovery error paragraph (`data-testid="hub-discovery-error"`) has no `role="alert"`. This pass's fix ("errors announced") covered only the two paragraphs it touched (`AddServerView.vue`, the rename sheet in `App.vue`), but the discovery add path is now a carrier of this change's new copy: `addSelectedDiscovered` renders `"<name>: A server named … is already saved"` (app-state.ts) into that unannounced paragraph, so a failed discovery add is silent to screen readers — exactly the defect class the round-1 report claims fixed. Add `role="alert"` there.

No further findings of this class were found after grepping: `mobile/src/components/*.vue`, `mobile/src/App.vue`, `mobile/src/reachability.ts`, `mobile/src/app-state.ts`, `mobile/src/server-entries.ts`, `mobile/src/tailnet.ts`, `mobile/src/form-validation.ts`, `src/ui-app/tests/*`.

## Edge cases
- `https://user:pass@host` was previously savable; the new authority character check now refuses it as "doesn't look like a web address". Probably intended, but the message doesn't hint that credentials are the problem.
- Hostnames with underscores (`my_server.example.com`) are also refused by the same check; browsers accept them.
- The stricter health check (`body.ok === true`) refuses older RepoOS servers whose health reply lacks `ok: true` — acknowledged in the QA doc; the current server (`src/server/routes/info.ts`) returns `{ ok: true, … }`, so the contract matches.
- Discovery: two tailnet rows sharing a project name — second add fails, error surfaces in the discovery banner, no rename available in discovery (documented design question, deferred to a human).
- Double-tap on the rename sheet's Save runs `renameServer` twice; benign (self-excluded from the duplicate check).

## Suggestions
- Discovery duplicate-name UX (rename before add) deserves its own small task, as the engineer proposes.

## Notes
Code verified against the real health contract (`{ ok: true }` in `src/server/routes/info.ts`), and `duplicateNameProblem`/`duplicateUrlProblem` are consistently applied on both the add and rename paths. No bare `node`/`npm`/`npx` in the diff — the QA script and its documented run commands use `bun`/`bunx`. No prior review passes exist; nothing to re-verify. Merge warning is this task's own `work/1242-*.md` only; no source conflicts.

## Verdict
`needs some work` — add `role="alert"` to the discovery error paragraph, then this is ready.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

