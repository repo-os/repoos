---
task: "0363"
pass: 1
at: "2026-11-12T18:36:55.046Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/tighten-ispreviewprocess-s-custom-comman
state: ok
tree_identity: "ff785b06d:"
---
## Verdict
`good to go` — Fallback now needs basename plus a whole second argv token (or `--port`); matches the #0362 follow-up and fails closed when arity is too low.

## Relevance
`still relevant` — #0362 left this orphan-match gap; nothing on `main` supersedes it.

## Evidence
None

## Bugs
None found

## Edge cases
- Port-less fallback still keys on token 2 only (`run`, `-e`, etc. can collide across unrelated `bun run …` / `bun -e …` after PID reuse — narrower than basename-only, not eliminated).
- `VAR=val bun …` makes token 0 the assignment, not the executable; matching may miss a live preview or fall through false (pre-existing tokenization shape).
- Custom command with no second token never matches without `--port` in `ps`; orphan entry is dropped, not killed (safe).
- Linux `ps` / `shell:true` quoting not exercised in-repo (engineer verified macOS only).

## Suggestions
- Add focused unit tests for tokenizer + `ps` cmdline matching (port path, two-token path, fail-closed).
- Refresh the `isPreviewProcess` block comment (~L826) — it still reads “binary token and port binding” without the second-token fallback.
- Confirm Linux behavior when a runner host is available; consider a env nonce in a later task if collisions persist.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

