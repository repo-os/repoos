# Control dashboard QA — November 2026

## Scope

Reviewed Mission Control at 1280px and 375px in headless WebKit against the auth-less `just serve-noauth` server from this task worktree. Inspected AI usage, system resources and CPU/memory sparklines, status counts, auto-engineering, feature releases, live activity, decisions, and attention. Checked rendered text, browser errors, viewport overflow, and the process table's narrow layout.

## Results

- **1280px:** The page stayed within the viewport. All six status cards rendered. The live board showed twelve feature releases, system metrics, machine pressure, top processes, and the process row. After a second resource sample, both CPU and memory sparklines rendered with SVG paths. No console or page errors occurred.
- **375px:** The page stayed at 375px wide with no document-level horizontal overflow. The resource panel and cards fit the viewport. The six-column process table now remains 560px wide inside its own horizontal scroller, so column labels and values do not collapse together. The table can be scrolled without widening the page.
- **Empty data:** The live repository returned the intended “No AI usage recorded yet” usage state and “No activity yet” state. The attention panel rendered its empty state on the first pass and populated rows on a later pass as repository state changed. The release timeline rendered populated entries.
- **Error data:** In headless WebKit at 375px, intercepted the board-usage and decisions requests with HTTP 503 responses. The usage panel displayed its unavailable message and Retry action; the decisions panel displayed the service error. The page remained within the viewport and produced no page errors.
- **Build and test:** `bun run build` passed. The focused responsive test passed in WebKit at 375px and 1280px, and its source assertion checks the scroll container and preserved row widths.

## Fix

The System Resources process header and rows used six grid columns without a narrow-screen overflow container. At phone widths, the grid could compress the fields until the process details were difficult to scan. The wrapper now scrolls horizontally, and the header and data rows retain a 560px minimum width. The surrounding panel and document remain viewport-sized.

Headless captures from this pass were kept under the ignored `.repoos/` directory and are not part of the committed QA record.
