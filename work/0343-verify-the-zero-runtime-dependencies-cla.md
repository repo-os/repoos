---
id: "0343"
title: "Verify the \"zero runtime dependencies\" claim — mermaid is in dependencies"
type: chore
status: review
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/verify-the-zero-runtime-dependencies-cla
model_override: openrouter/deepseek/deepseek-v4.1-flash
review_model_override: opencode-go/deepseek-v4-pro
created_at: "2026-09-13T16:47:49Z"
updated_at: "2026-09-15T07:49:44Z"
---
"Zero runtime dependencies" is stated as a hard design constraint in AGENTS.md
and claimed publicly on the repoos.org landing page ("the supply chain you ship
is the one you read"). But `package.json` currently has a non-empty
`dependencies`:

    "dependencies": { "mermaid": "^11.17.2" }

## What to check

`mermaid` appears to be imported only by the browser UI —
`src/ui-app/src/lib/mermaid.ts`, via a dynamic `import("mermaid")` — and to be
bundled into `dist/ui/assets/` at build time (mermaid chunks are visible in
`bun run build` output). If that's the whole story, it is a **build-time**
dependency of the UI bundle, not a runtime dependency of the CLI or server,
and it is misclassified.

The practical consequence of the misclassification: a package-manager install
(`bun add -g repoos` / `npm i -g repoos`) downloads mermaid for every user even
though the shipped bundle already contains what it needs. The curl/standalone
install is unaffected (it ships `dist/` directly).

## Decide and act

1. Confirm nothing in `src/core`, `src/server`, `src/cli` or `src/commands`
   imports mermaid at runtime, and that `dist/ui` genuinely carries the bundled
   copy.
2. If confirmed, move it to `devDependencies` and verify end to end:
   - `bun run build` still produces working mermaid rendering in the UI
     (render a task with a ```mermaid block and confirm the diagram appears —
     `repoos check`'s UI smoke test will NOT catch a regression here).
   - A clean install from the built package doesn't fetch mermaid.
   - `repoos check` passes.
3. If it genuinely IS needed at runtime, then the claim is wrong rather than
   the classification. Say so, and correct AGENTS.md's "zero runtime
   dependencies" wording plus the landing page's "Zero runtime dependencies"
   card (`landing/src/App.vue`) so the public claim matches reality.

Either outcome is fine — what's not fine is the claim and the manifest
disagreeing. Note the lockfile will change either way; commit it.

## Activity

- 2026-09-13T16:47:49Z · created · unknown
- 2026-09-14T08:00:50Z · review_model_override
- 2026-09-14T08:00:52Z · status inbox→ready
- 2026-09-15T07:41:22Z · model_override
- 2026-09-15T07:41:25Z · status ready→active, branch
- 2026-09-15T07:49:44Z · status active→review
