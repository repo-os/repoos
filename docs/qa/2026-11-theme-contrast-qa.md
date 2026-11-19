# Theme contrast QA — November 2026

## Scope

Ran the rendered contrast audit from the task worktree with headless WebKit using `bun run contrast:audit`. The audit exercised 14 screen states across all 16 configured theme scopes: classic, Clear, Gen Z, Jelly, Gruvbox, Catppuccin, Hypercolor, and Solarized, each in dark and light mode. The screen-state harness covers the main app pages and representative dialogs/drawers used by the existing audit fixture.

## Result

Passed on 2026-11-19 in 18.6 seconds. The audit examined 15,254 visible text runs. It exempted 320 runs by the configured contrast exemption or `data-contrast-ok` annotations, skipped 64 disabled-component runs and zero invisible runs, and judged 7,931 runs against the worst stop of a background gradient. No text fell below the WCAG contrast floor in any theme scope.

Fourteen text runs using `background-clip: text` (the gradient logo) were unchecked by the rendered text probe. The audit reported these separately; they were not counted as contrast failures. The configured collapsed board column label/count exemption remains in force because text overlays per-column status gradients; see `docs/contrast-audit-triage.md` for its existing rationale.

## Changes

No UI color or token changes were warranted by this run. No regression test was added because the audit found no reproducible defect to encode. The audit code, theme scopes, exemptions, and `repoos.toml` were not changed.

## Reproduction

From the repository root, build first if `dist/commands/ui-contrast-audit.js` is absent, then run:

```sh
bun run build
bun run contrast:audit
```

The audit uses the repository's configured `check.themeScopes` and launches WebKit headlessly; it does not open a visible browser.
