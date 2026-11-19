---
task: "1222"
pass: 1
at: "2026-11-19T09:16:06.018Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-every-settings-tab-saves-validat
state: ok
tree_identity: "d02d8dded:"
---
## Verdict
`good to go` — QA round 2 diff is the report plus seven reproducible headless walkers; no product defects, criteria met.

## Relevance
`still relevant` — a second Settings QA pass was requested, and the round-1 fixes were still in place at branch time, so the verification premise holds.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: all seven walkers (`docs/qa/settings-tabs-qa2-*.mjs`), `src/commands/ui-harness.ts`, `src/commands/ui-smoke.ts`, `package.json` scripts, shebangs across the diff, and every spawned-process/path reference in the diff.

## Edge cases
- **Fixture isolation verified:** `makeSmokeFixture()` builds its scratch root via `makeTempDir` with its own minimal `repoos.toml`; `startPreviewServer` serves only that root on `port: 0` with auth disabled. The real `repoos.toml` is never read or written — acceptance criterion met. Walkers run `webkit.launch()` headless (default), no headed mode, no `open`-style calls.
- **Runtime:** all walker shebangs are `#!/usr/bin/env bun`; the only `node:` references are stdlib imports (`node:fs`), which is fine. No new `node`/`npm`/`npx` invocations anywhere in the diff.
- **Error-timing honesty:** the report correctly distinguishes audit artifacts (float re-display rounding, string-probe on array-typed inputs rejected server-side) from product bugs, and the dedicated `array-errors.mjs` walker captures validation errors before any reload — the right fix for the false "no validation" signal. The 6-of-114 non-identical rows are all explained rather than hidden.
- **Failure teardown:** walkers close browser and server only on the happy path (top-level awaits, no `try/finally`); an unexpected probe throw leaves the in-process server handle alive until `process.exit`. One-shot QA scripts, so tolerable.
- **Reportable claims:** engineering report numbers (21/21 layout, 114/108 audit, array error texts, TOML malformed-write byte-identical) match what the committed walkers are structured to measure; the report asserts claims at the granularity the evidence supports. The report source commit matches the reviewed tree per the server note.

## Suggestions
- `settings-tabs-qa2-audit.mjs` writes its progress log to the relative `.repoos/qa-1222-progress.log`, so running it from the real repo root drops a file inside the live checkout's `.repoos/`; prefer the same env-gated `QA_PROGRESS` path `walk.mjs` uses.
- Uniqueness of the audit's "visible panel" filter could be simplified, but the corrected visible-only enumeration is functionally right; no action needed for this round.

## Could not verify (environment)
None

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

