---
task: "1120"
pass: 1
at: "2026-11-14T23:35:00.514Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/repoos-hub-app-native-looking-server-pic
state: ok
tree_identity: "25a0dacd0:bbc5e0e67"
---
## Verdict

`needs some work` — Hub shell code looks solid, but AC7 is unmet: no `repoos-mobile-dev` preview target, empty `## Shots`, and tests omit navigation/list UI.

## Relevance

`still relevant` — The Capacitor picker still needs this UX pass; nothing on `main` supersedes it.

## Evidence

`EVIDENCE-GAP-ONLY` — Sole capture `default-1.png` is auto `src/ui-app/**` Mission Control at 1280×800, not Hub at 390×844. No light/dark, theme, iOS/Android, or Settings/list fixtures. `## Shots` is `[]`.

## Bugs

- **Class: preview-target-registration** — Branch never adds `[[preview.targets]]` `repoos-mobile-dev` (`repoos.toml` ends at Docs site); engineer report claims it but diff has no `repoos.toml` change, so `mobile/**` tasks still resolve `default`.
- **Class: acceptance-test-gap** — `mobile-hub-shell.test.ts` only checks theme normalization, `localStorage` boot mirror, fixture arrays; AC7 also requires mode persistence, server-list states, and Settings navigation (not covered).

No further findings of this class were found after grepping: `repoos.toml`, `shot-plan.test.ts`, `shot-targets`, `.claude/launch.json`, `mobile-hub-shell.test.ts`, task `## Shots`.

## Edge cases

Touch HTML5 drag in edit mode may differ on hardware; Capacitor anti-flash still depends on `init()` after the inline boot script. `just build-android` not run (per AC8). On-device theme/status-bar checks remain Nick’s follow-up.

## Suggestions

Add preview target + declare 390×844 shots (`?platform=`, `?theme=`, `?appearance=`, `?fixture=`). Expand tests or component mounts for settings back and list states. Human: install debug build, run `just build-android` when SDK available.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-14T23:18:37.925Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

