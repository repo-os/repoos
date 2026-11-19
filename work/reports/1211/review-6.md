---
task: "1211"
pass: 6
at: "2026-11-19T08:18:30.143Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-remote-runner-setup-docs-and-run
state: ok
tree_identity: "ac6244a5d:cecc8791c9"
---
Repeated review classes: Passes 1–5 kept blocking on one class, `prohibited remote interaction` — a one-time SSH link probe to `nick@thinkpad` during an early `repoos check`. That is a historical process incident, recorded candidly in `docs/qa/2026-11-runner-docs.md`; no code can undo it, and the diff introduces no remote interaction, so under the frozen bar it is non-blocking. Pass 3's `contradictory PATH guidance` is fixed and verified against code (`src/server/remote-validation.ts:2311` and `scripts/remote-runner/validate-macos.sh:68` both use `bash -lc`). A human should note the recurring pattern of reviews blocking on the unfixable incident.

## Verdict
good to go — docs and UI match the recipes and code; capture predates a doc-only commit.

STALE-EVIDENCE-ONLY

## Relevance
still relevant — the service-account vs SSH-login distinction was genuinely missing from docs and the runner screen.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `justfile` recipes (`_setup-runner`, `_setup-runner-native`), `scripts/remote-runner/validate-macos.sh`, `src/server/remote-validation.ts` (`prereqProbeCommand`), `docs/remote-validation.md`, `user-docs/check.md`, `RemoteRunnersPanel.vue` and its tests, `runner-setup-docs.test.ts`, the diff for bare `node`/`npm`/`npx`, and review reports 1–5.

## Edge cases
- The engineering report (round 4, source `8e2c58377`) predates HEAD: the delta is one QA-doc paragraph (the WIP commit `ac6244a5d` edited only `docs/qa/2026-11-runner-docs.md`). I verified its substantive claims against code instead of trusting it.
- I spot-checked doc claims against `justfile`: `_setup-runner` destinations, `usermod -aG docker` + re-login warning, `sudo install` to `/opt/repoos/validate.sh`, no-sudo native install to `~/.local/bin/repoos-validate`, and `repoos runners setup "$HOST"` — all match. Native `bash -lc` claims match the probe and native script.
- Live users, PATH and tool versions on bee/thinkpad/mini remain unverified by design (read-only task); the QA doc says so explicitly.
- Mergeability is server-computed: only this task's own work file conflicts, resolved from main at close-out.

## Suggestions (non-blocking)
- The handoff capture was taken at tree `cecc8791c9`, flagged STALE against HEAD `ac6244a5d`. The delta touches only QA-doc prose and bookkeeping — the captured UI (`runner-identity-note` on `/checks?tab=now`, `runners:queued`) is unchanged since `8e2c58377`, so the capture is representative. A re-capture on the final tree would clear the flag.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T04:29:06.053Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

