# Mobile polish QA: Work home, phone scrollbar, header row (#1258)

## Scope

Three small fixes seen on a phone (Android Hub, Mission Control):

1. The app opened on Mission Control. It now opens on Work.
2. A visible page scrollbar sat on the right edge at phone widths, which left the gutters unequal.
3. The project chip was taller than the round header buttons and its text was light and small.

## What was checked

Automated, headless WebKit only (`src/ui-app/tests/mobile-header-scroll-browser.test.ts`). The test loads the real `style.css` plus the TopBar and NoticeBell scoped styles on markup that mirrors their templates.

- **Header row height:** project chip, search, notifications, theme, help and account controls. Each one's computed height equals the shared `--topbar-control-h` token (30px above 900px, 44px at 900px and below). Checked at 375, 412, 768 and 1280 px, in both dark and light themes. Each control's centre sits within half a pixel of the header's centre line.
- **Project chip:** a 999px radius (matching the search field beside it), 13px text at weight 600, and a mono name at weight 700.
- **Phone gutters:** at 375 and 412 px the page's right padding is 0 and the left and right gutters match. The document and `.main` do not scroll sideways, and the page scroller still scrolls when its `scrollTop` is set.
- **Scrollbar rule:** a stylesheet test (always runs) pins the phone-only `scrollbar-width: none` and `::-webkit-scrollbar { display: none }` rule for `.main > :not(.spin)`. Headless WebKit draws overlay bars, so the rule's effect on a visible bar is not measured here.
- **Default route:** `src/ui-app/tests/home-route-work.test.ts` uses the real router. `/` resolves to `/work`; unknown paths keep main's not-found view (#1252). `/control` is Mission Control. Deep links keep their query. `router-guard.test.ts` now expects a login return path of `/work`.
- **Skeletons and nav:** `app-loading-skeleton.test.ts` covers the `/control` and `/` skeleton kinds and page titles.

## What was not checked here

- **A real Android device or the Hub shell.** Touch behaviour, the Hub's start URL on a device, and how the phone's own overlay scrollbar looks need a person with a phone. They are not claimed as verified. The Hub loads the server root, which now redirects to `/work`.
- **Desktop scrollbars.** The desktop rules are untouched. No desktop scrollbar assertion is made, because headless WebKit does not draw one.

## Routes and docs that moved

- Mission Control moved from `/` to `/control` (`src/ui-app/src/router.ts`, `src/ui-app/src/nav.ts`). `/` redirects to `/work`.
- The loading skeleton maps `/control` to the dashboard shape and `/` to the board shape.
- `docs/adr/0011-mobile-web-ui.md` records the new Activity capture path.
- Dated QA and audit notes that mention `/` for Mission Control were left as written, since they describe the app at their date.
