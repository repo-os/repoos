---
id: "0016"
title: Fix web UI not mounting (raw mustache rendered)
type: bug
status: review
priority: p1
area: ui
assigned_to: ai
created_by: nick
branch: ""
created_at: 2026-06-03T05:55:16Z
updated_at: 2026-06-03T05:55:16Z
---
## Activity

- 2026-06-03T05:55:16Z · created · unknown
- 2026-06-03T14:10:00Z · status ready→active
- 2026-06-03T14:12:00Z · status active→review

## Problem

The web UI renders raw `{{ mustache }}` template syntax instead of values, and
multiple overlays (task drawer + new-task modal) show simultaneously. This is
the signature of Vue NOT MOUNTING: the page serves (HTTP 200) but the client app
never starts, so `v-if`/interpolation are never evaluated. Server-side checks
pass; only the browser reveals it.

## Diagnosis first (do not guess)

1. Open the browser dev console + Network tab, reload, and read the actual error.
2. It will be one of:
   - 404 / failed load on `/vendor/vue.global.prod.js` + "Vue/createApp is not
     defined" → the vendored Vue runtime isn't served. Check: did `bun run
     build` copy `src/ui/vendor/` → `dist/ui/vendor/`? Is the server's vendor
     route intact? Is the file where the server resolves it?
   - SyntaxError / ReferenceError at a line in the inline script → a JS error in
     `app.html` (likely introduced editing the UI) stops execution before
     `.mount()`. Fix the error.
3. Report the exact console output and the root cause before fixing.

## Acceptance criteria

- [ ] Root cause identified from the console, not assumed
- [ ] Vue mounts: no raw mustache in the rendered DOM; exactly one overlay shows
      at a time; the dashboard/board render real data
- [ ] If vendor-Vue serving was the cause, the build reliably copies it and the
      server reliably serves it — verify from a clean `bun run build`
- [ ] Browser console is error-free on load
- [ ] Verified in an actual browser (headless or manual), not just `curl`/200

## Notes for AI

- The page returning 200 is NOT verification — that's exactly the trap here. The
  server was happy; the app was broken. Verify in a browser.
- After `bun run build`, hard-refresh (Cmd-Shift-R) — cached assets mask fixes.
- If the cause is the vendored Vue not being served, the fix is likely in the
  build/asset-copy step or the server's static route, NOT in feature code.
- Frontmatter uses `created_at` (UTC/Z) per current format — match 0007.
