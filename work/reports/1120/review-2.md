---
task: "1120"
pass: 2
at: "2026-11-15T01:50:57.129Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/repoos-hub-app-native-looking-server-pic
state: ok
tree_identity: "9c031e8d1:9c031e8d11"
---
## Verdict

`good to go` — `EVIDENCE-GAP-ONLY` Hub shell matches AC1–6 in code; AC7 unit tests are in place; Hub UI shots still need `repoos-mobile-dev` on main.

## Relevance

`still relevant` — Capacitor picker UX is still bare on `main`; this branch delivers the scoped shell work ADR 0011 describes.

## Evidence

- `## Shots` is `[]`; no declared 390×844 Hub captures.
- Sole handoff PNG `default-1.png` is auto `src/ui-app/**` Mission Control at `default`, not mobile picker (fixture routes would use `repoos-mobile-dev`).
- Missing: light/dark, ≥2 themes, iOS/Android styling, Settings/list/add fixtures per AC7.

## Bugs

None found

No further findings of this class were found after grepping: `mobile/`, `src/ui-app/tests/mobile-hub-shell.test.ts`, `src/core/shot-page.ts`, `repoos.toml`, `justfile`, `mobile/package.json`, `mobile/scripts/sync-ui-theme-vars.mjs`.

## Edge cases

Pass 1 **acceptance-test-gap** is fixed: `mobile-hub-shell.test.ts` now covers mode persistence, list fixtures (empty/one/many/unreachable), settings/add routing, and hypothetical `repoos-mobile-dev` resolution. **preview-target-registration** remains a Nick-on-`main` step (task branch correctly avoids `repoos.toml`). Native anti-flash still depends on Preferences→`localStorage` mirror before inline boot; unverified on hardware. `just build-android` not run (AC8). Close-out: task-file-only merge warn per landing checklist.

## Suggestions

Register `repoos-mobile-dev` in `repoos.toml` on `main`, then declare 390×844 shots (`?fixture=`, `?theme=`, `?appearance=`, `?platform=`). Re-capture after target exists; drop misleading `default` auto shot. Follow-ups: device install, iOS hardware polish, SDK `just build-android`. Consider deduplicating `mobile/index.html` boot palette with `theme-core.ts` to limit drift.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-15T01:50:02.181Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

