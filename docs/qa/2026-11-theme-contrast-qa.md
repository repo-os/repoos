# Theme contrast QA — November 2026

## Scope

Ran the rendered contrast audit from the task worktree with headless WebKit using `bun run contrast:audit`. The audit exercised 17 screen states across all 16 configured theme scopes: classic, Clear, Gen Z, Jelly, Gruvbox, Catppuccin, Hypercolor, and Solarized, each in dark and light mode. Screen states include dashboard, Work, drawer/dialog, Agents, Settings, Checks, Dev and Context, plus Releases and Deployments as dedicated rendered states.

## Result

Passed on 2026-11-19 in 22.3 seconds. The audit examined 17,282 visible text runs. It exempted 320 runs by the configured contrast exemption or `data-contrast-ok` annotations, skipped 64 disabled-component runs and zero invisible runs, and judged 9,265 runs against the worst stop of a background gradient. No text fell below the WCAG contrast floor in any theme scope.

Twenty text runs using `background-clip: text` (the gradient logo) were unchecked by the rendered text probe. The audit reported these separately; they were not counted as contrast failures. The configured collapsed board column label/count exemption remains in force because text overlays per-column status gradients; see `docs/contrast-audit-triage.md` for its existing rationale.

## Changes

Added Checks, Releases, and Deployments routes to the rendered audit's screen matrix. This closes the coverage gaps called out during review and in `docs/qa/2026-11-themes.md`, which noted that layout checks did not substitute for rendered contrast coverage. No theme token changes were warranted by this run, and no contrast exemptions were added.

## Reproduction

From the repository root, build first if `dist/commands/ui-contrast-audit.js` is absent, then run:

```sh
bun run build
bun run contrast:audit
```

The audit uses the repository's configured `check.themeScopes` and launches WebKit headlessly; it does not open a visible browser.
