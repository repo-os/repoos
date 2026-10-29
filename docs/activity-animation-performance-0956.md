# Activity animation performance follow-up (#0956)

Measured 2026-10-29 in the #0980 worktree using Playwright CDP with headless
Chromium 1248. The baseline stylesheet is from `d5e061f5c136dd9fd049cb3c7fc8d6e7ff86bd0`,
the first parent of the #0956 merge `c64de8588`. The after stylesheet is from
the #0980 starting revision `9a1bd50c0`.

## Method

Loaded each revision's `src/ui-app/src/style.css` into an isolated Chromium page
and rendered six visible card-shaped containers, each with the default
orbital-pixel activity indicator markup and size. After a two-second warm-up,
the page collected `Performance.getMetrics` before and after a 10-second sample
and counted `requestAnimationFrame` callbacks over the same interval. Renderer
CPU is reported as the delta in CDP `TaskDuration`, converted to a percentage
of one core. Each condition was sampled once in before-then-after order.

This isolates the six visible indicators and their card layout; it does not
mount the full RepoOS board or include server, Vue, or unrelated board work.
The six visible indicators are within the default concurrency limit, so all
six remain animated on both revisions. This workload therefore does not
exercise the coordinator's offscreen, hidden-tab, or over-cap pause savings.

## Results

| Revision | Renderer `TaskDuration` / 10 s | One-core CPU | RAF callbacks / 10 s | RAF rate | Active animations |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before #0956 (`d5e061f5`) | 0.1033 s | 1.03% | 130 | 13.0 fps | 6 |
| After #0956 (`9a1bd50c`) | 0.0840 s | 0.84% | 121 | 12.1 fps | 6 |

The single-sample renderer CPU delta is about 0.19 percentage points of one
core (about 19% relative), while the measured RAF rate differs by 0.9 fps.
Because this was one short run per condition in fixed order, the differences
are not conclusive evidence of a CPU improvement. The RAF rates are also far
below a display refresh rate in this headless environment, so they should be
read as observed callback rates, not visual display FPS.

`Performance.getMetrics` returned no GPU or compositor metric in this Chromium
session. GPU utilization was not measured. No GPU reduction is claimed from
these results.
