---
id: "0617"
title: Fix rendered-contrast audit half-flipped theme race
type: bug
status: done
priority: p2
area: web
merged_commit: 699ba1ad4f0a6af85c03cbe52f649d463c9c24dd
assigned_to: ai
created_by: ""
branch: feat/fix-rendered-contrast-audit-half-flipped
cli_override: opencode
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-10-01T17:54:57Z"
updated_at: "2026-10-01T18:48:57Z"
---
## What

The rendered contrast audit (`bun run contrast:rendered` / the
`rendered-contrast` check step) intermittently reports a phantom failure that
is a *half-flipped theme state*, not a real contrast defect:

```
div#setting-maxConcurrentAgents.setting-row > div.setting-info > div.setting-desc
— #79809b on #ffffff = 3.91 (need ≥4.5, 11px) [settings]
```

`#79809b` is the **dark** theme's `--txt-faint`; `#ffffff` is a **light** card.
The pair cannot coexist in a correctly applied scope — it is dark text on a
light background mid-flip.

## Evidence

Observed while closing out #0616 (a harness integration that touches no UI
source): the pre-review `repoos check --changed main` passed, an isolated full
`repoos check` passed, and 5/5 isolated `bun scripts/ui-contrast-audit.mjs`
runs passed — but one handoff finalization failed `rendered-contrast` on this
exact finding. `docs/contrast-audit.md` already names this failure class
("a probe can see *dark text on a light card* (half-flipped state) and report
failures no run reproduces") and says the `data-ui-theme` config-load barrier
was added to prevent it. The race is evidently still open.

## Likely cause / where to look

`src/commands/ui-contrast-audit.ts`, `runAudit()`: after `gotoApp`'s one-time
barrier, the per-scope loop sets `data-theme`/`data-ui-theme` (plus
`localStorage`) and immediately calls `page.evaluate(contrastProbe, …)` with no
frame/paint or app-flush wait between the attribute write and the probe. A
Vue/config-store async update (or a stale computed style) can be sampled
mid-transition. Candidate fixes: wait for a double `requestAnimationFrame` (or
an equivalent "styles settled" barrier) after each scope flip before probing,
and/or re-assert the attributes and confirm the resolved `--txt-faint` matches
the intended mode.

## Acceptance criteria

- The audit is stable across repeated runs on an idle machine, on a tree with
no UI changes (e.g. 10/10 clean runs), including the Settings screen.
- If the finding is instead a real token leak (a light scope missing a
`--txt-faint` override), fix the token — do NOT exempt it: faint/dim tokens
were deliberately raised to meet WCAG AA, per `docs/contrast-audit.md`.
- `docs/contrast-audit.md` updated if the barrier/mechanism changes.

## Notes

- Pre-existing and unrelated to #0616; filed separately so the harness
integration's close-out does not carry an out-of-scope fix.
- The 2026-10-01 evidence above is the reproduction recipe; a run that fails
should print the `#setting-maxConcurrentAgents` finding.

## Activity

- 2026-10-01T17:54:57Z · created · unknown
- 2026-10-01T18:01:49Z · cli_override
- 2026-10-01T18:02:25Z · model_override
- 2026-10-01T18:02:33Z · status inbox→ready
- 2026-10-01T18:02:34Z · status ready→active, branch
- 2026-10-01T18:13:11Z · status active→review
- 2026-10-01T18:48:57Z · status review→done, release:success
