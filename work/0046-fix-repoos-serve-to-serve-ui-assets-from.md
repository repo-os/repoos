---
id: "0046"
title: Fix repoos serve to serve UI assets from the repo root
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/fix-repoos-serve-to-serve-ui-assets-from
created_at: "2026-08-06T14:42:07Z"
updated_at: "2026-08-06T18:03:59Z"
---
## Activity

- 2026-08-06T14:42:07Z · created · unknown


## Problem

`findUiDir()` in `src/server/server.ts` resolves UI assets from
`import.meta.url` (the compiled `dist/server/server.js` location). Under a
`bun link` install, that's the linked package's `dist` — the MAIN repo's build.
So `repoos serve` run inside a git worktree serves the main checkout's
`dist/ui` (stale) instead of the worktree's freshly built UI. The health/API
side resolves the repo root from cwd correctly, but static UI does not — so a
worktree agent's headless-browser probe verifies the WRONG build. Observed live:
the served `index.html` referenced `assets/index-BMBnkhS2.js` while the
worktree's own build referenced `assets/index-BAtSxOm1.js`.

## Desired UX

`repoos serve` serves the UI build that belongs to the repo root it resolved
(the same root used for tasks), falling back to the install-location dist only
when no root-relative build exists. A worktree agent serving for verification
sees its own fresh UI.

## Acceptance criteria

- [ ] `findUiDir` prefers the resolved repo root's `dist/ui`, then falls back to the `import.meta.url` candidates (compiled + dev paths).
- [ ] `repoos serve` in a worktree with a fresh build serves that build (the served `index.html` references the asset hash present in the worktree's `dist/ui`).
- [ ] Main-repo `repoos serve` behaves exactly as before (root-relative dist is the same file set).
- [ ] With no `dist/ui` anywhere, the existing fallback holds (500 `UI asset not found — run bun run build`), and the legacy `app.html` path still works.
- [ ] `repoos check` passes; the UI smoke test still passes.

## Notes for AI

- Touch `src/server/server.ts` only (the `findUiDir` function and its call site — it receives the resolved root).
- Root resolution must stay as-is (`findRepoRoot` from cwd); only the UI dir lookup changes.
- Rebuild (`bun run build`) and verify with a live serve in a worktree, not just unit reasoning.

## Activity

- 2026-08-06T18:03:57Z · status inbox→ready
- 2026-08-06T18:03:59Z · status ready→active, branch
