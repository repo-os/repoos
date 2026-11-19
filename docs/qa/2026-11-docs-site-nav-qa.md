# Docs site navigation, search and links QA at 375, 768 and 1280 px — November 2026

Task #1245. This pass covers the VitePress user docs site (`user-docs/`, the
docs.repoos.org build) at the phone, tablet and desktop widths that matter for
it: 375, 768 and 1280 CSS pixels. It checks the sidebar, the phone top-nav
screen, local search, every internal link on the built site, and code blocks.

## Scope and method

- Built from this worktree with `bun run build` in `user-docs/`, then served with
  `vitepress preview` on port 5174. Every check ran against that local build.
- Browser: headless WebKit through Playwright, the same engine the repo's UI
  smoke test uses. No visible browser was opened, and no URL was opened with
  `open` or `xdg-open`.
- Link check: `user-docs/scripts/check-links.ts`, which runs as the last step of
  `bun run build`. It reads every rendered page in `.vitepress/dist` and resolves
  each internal `href` and `src` the way a browser does on the published site. A
  `#fragment` must match an `id` or `name` on the target page. VitePress skips
  relative dead-link checks in this site (`ignoreDeadLinks`), so the build alone
  did not catch these.
- Layout and nav: `docs/qa/measure-docs-site-widths.mjs` sweeps all 29 sitemap
  routes at each width, then runs the sidebar, phone nav screen and local search
  flows. The page rules come from `user-docs/scripts/layout-metrics.ts`, which the
  browser test `user-docs/scripts/layout.test.ts` also uses. Reproduce with
  `bun run build` in `user-docs/`, then `bun docs/qa/measure-docs-site-widths.mjs`
  from the repo root (`QA_BASE` sets the preview URL, default `http://127.0.0.1:5174`).

## Results

| Check | Before | After |
| --- | --- | --- |
| Internal links that resolve on the built site | 39 broken of 1,873 | all 1,857 resolve |
| Code blocks with the language label under the copy button or over code | 19 of 20 on `/getting-started` at each width | 0 on all 29 pages at 375, 768 and 1280 |
| Pages that scroll sideways or have an element past the viewport | none found | none found |
| Sidebar reaches the CLI page | passes at 375, 768 and 1280 | passes |
| Phone top-nav screen lists Agents inside the viewport | passes at 375 | passes |
| Local search for "authentication" fits the dialog and opens a result | passes at 375, 768 and 1280 | passes |

The final sweep covered 87 page loads (29 routes × 3 widths) and 471 code blocks.
Of those blocks, 178 scroll sideways inside their own box. That is the designed
behaviour for long shell lines, and the sweep does not count it as overflow.

## Findings and fixes

**1. Changelog section links pointed at ids that did not exist.** Each release
note on `/changelog` renders its headings with a release-scoped id, such as
`v0-5-79--highlights`. The header-anchor link inside each heading still said
`#highlights`, so 20 links went nowhere. `user-docs/.vitepress/release-heading-ids.ts`
now rewrites the link with the same scoped id. It is covered by
`user-docs/scripts/release-heading-ids.test.ts`.

**2. Sixteen links pointed at repo-only files.** Pages such as `/cli` and
`/configuration` linked to `../docs/…`. That path exists on a RepoOS checkout,
but on the published site it is a 404. Each one now links to the same file on
GitHub, `https://github.com/repo-os/repoos/blob/main/docs/…`, which is the form
`android-hub.md` already uses. Every target was confirmed to exist in `docs/` first.
The `(#0761)` heading in `previews.md` is linked with GitHub's slug,
`#evidence-shots-for-non-web-targets-0761`. I could not fetch GitHub to confirm
that slug resolves, so it is unverified (see below).

**3. Three anchors had drifted from their headings.** VitePress turns `## 2. Choose
agents per role` into `_2-choose-agents-per-role`, drops the apostrophe in
"task's" to give `previewing-a-task-s-changes`, and splits `repoos story
new|list|show|update` into `repoos-story-new-list-show-update`. The three links now
use the ids the build emits. `check-links.ts` fails the build if they drift again.

**4. The language label covered the copy button and the code.** On every code
block, VitePress puts the label (`bash`) at the top-right corner, where the copy
button also sits. The copy button painted over the label at all three widths. On
install-command blocks the label was then moved over the visible command. The
fix in `user-docs/.vitepress/theme/custom.css` moves the label to the top-left, in
the padding above the first code line, and sets `line-height: 1` so its box does
not touch the code. Before the fix the sweep measured 19 of 20 blocks on
`/getting-started` with the label under the button. The browser test
`layout.test.ts` fails on every page at every width when this rule is removed.

## Checked with no defect found

- No page scrolls sideways at 375, 768 or 1280, in any of the 29 routes.
- The sidebar opens from the Menu button at 375 and 768 and lands on the CLI page.
  The desktop sidebar link works at 1280.
- The phone top-nav screen at 375 opens and lists the Agents link inside the viewport.
- Local search at 375, 768 and 1280 fits the dialog to the viewport. The results
  list is readable at 375, and a result opens its page.
- Screenshots were checked by eye. The open phone menu and the phone search
  dialog at 375 looked right. The code blocks at 375 and 1280 were re-shot after
  the final label rule, and the label sits clear of the copy button and the code.

## Not verified

- **External links were not fetched.** The link check covers internal links only.
  The GitHub `blob/main` links added in fix 2 and the `#…-0761` anchor are not
  confirmed live. A reviewer with network access should open them once.
- **Dark and Gruvbox themes.** The sweep ran the default theme. The theme
  switcher's other themes were not measured at these widths.
- **768 px visually.** The sweep measured 768 px for overflow, nav and search,
  but no 768 screenshot was taken and inspected.
- **Real devices and touch.** Headless WebKit only. No device, touch input, or
  iOS Safari behaviour was tested.
- **The mobile menu's first attempt.** Early runs of this pass saw 404s for the
  entry bundle and an unresponsive Menu button. Those came from a preview server
  that kept serving assets from before a rebuild. They are not a product defect,
  and the final runs were against a freshly started preview.
