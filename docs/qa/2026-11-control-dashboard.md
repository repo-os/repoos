# Control dashboard QA — November 2026

## Scope and method

Reviewed Mission Control in headless Playwright against the auth-less `just serve-noauth` server launched from a scratch clone of this task worktree. Checked the populated dashboard and intercepted service failures at 1280×1200 and 375×1200. The populated resource captures use the new `system:processTable` preview fixture so the resource sampler cannot leave the process table in its loading state.

## Results

- **Desktop and phone width:** At both widths the document remained exactly the viewport width, all six status cards rendered, and no page errors occurred. The 375px resource panel stacks CPU, memory, agents, machine and codebase metrics vertically. The process table keeps its 560px row width within its own horizontal scroller; the page itself does not widen.
- **Resources and charts:** The populated fixture rendered one process row (`#1205`, CPU, memory and runtime) and both CPU and memory sparklines at 375px. The same panel rendered at 1280px with all process columns visible. The screenshot locator captures the complete resource panel, including content below the viewport fold.
- **Empty data:** At both widths the usage panel displayed “No AI usage recorded yet.” and Live activity displayed its empty message. The dashboard still rendered the six status cards and populated resource panel.
- **Error data:** At both widths Playwright intercepted `/api/stats/board` and `/api/decisions` with HTTP 503 responses. Usage showed its unavailable message and Retry button, and the decision panel displayed its service error. Neither state caused document overflow or a browser page error.
- **Screenshots:** Full-page and resource-panel captures were saved in the ignored `.repoos/` directory as `control-dashboard-real-{1280,375}.png`, `control-dashboard-resource-{1280,375}.png`, and `control-dashboard-error-{1280,375}.png`. Handoff shots are declared separately at both viewport widths.

## Fix and regression coverage

On narrow screens, the process table previously squeezed its six grid columns into the resource panel. The wrapper now scrolls horizontally and the header and rows retain a 560px minimum width. `system:processTable` supplies deterministic resource metrics and a representative task process for desktop and narrow review captures. The responsive geometry test protects the scroller and minimum row width; a component fixture test verifies that the populated process row renders in the actual `SystemResourcePanel`.
