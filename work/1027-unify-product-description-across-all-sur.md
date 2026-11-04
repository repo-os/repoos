---
id: 1027
title: Unify product description across all surfaces
type: chore
status: active
priority: p2
area: [landing, docs, server, infra]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/unify-product-description-across-all-sur
created_at: "2026-11-04T06:53:26Z"
updated_at: "2026-11-04T07:15:14Z"
---
## Problem

The product describes itself differently on every surface, and several descriptions use phrasing we're moving away from ("tech leads", "task tracking", "monorepo"):

- npm (`package.json`): "The repo is the operating system. Repo-native, AI-agent-friendly task tracking that lives as markdown files in your monorepo."
- Landing page meta/OG/Twitter (`landing/index.html`): "AI dev teams for engineers and tech leads. Bring your own agents and models…"
- Docs site meta (`user-docs/.vitepress/config.mts`): "AI dev teams for CTOs and builders. Bring your own agents and models…"
- Homebrew formula (`repo-os/homebrew-tap` → `Formula/repoos.rb`): "Repo-native task tracking for AI-assisted engineering"
- Board UI page title (`src/server/routes/ui.ts`): `` `Repo-native task tracking for ${name}` ``

There is no single approved description, so every surface drifts independently.

## Desired UX

One consistent, startup-y description everywhere, from two approved lines:

- **Long** — `The repo is the operating system. Your AI dev team, living in your repo, for CTOs and builders.`
- **Short hook / SEO** — `Your AI dev team, living in your repo, for CTOs and builders.`

Anyone reading the npm page, the landing page, the docs site, or `brew info` sees the same positioning, with the retired phrases gone from all product-description copy.

## Acceptance criteria

- [ ] `package.json` line 4 `description` shows the Long line exactly.
- [ ] Landing page meta description, OpenGraph and Twitter fields (`landing/index.html` lines 11, 21, 29) show the Short hook exactly.
- [ ] Docs site meta (`user-docs/.vitepress/config.mts` line 30) shows the Short hook exactly.
- [ ] Homebrew formula `desc` (`repo-os/homebrew-tap` → `Formula/repoos.rb`) shows the Short hook exactly, if it passes brew's desc length/style lint.
- [ ] Board UI page title (`src/server/routes/ui.ts` line 76) no longer says "task tracking" (e.g. `` `${name} · RepoOS` ``).
- [ ] `rg -i "tech leads|task tracking|monorepo"` returns no product-description hits; other taglines found in README, SKILL.md, llms.txt files, docs index and release templates are aligned to the approved copy.
- [ ] Landing site builds successfully.
- [ ] Docs site builds successfully.
- [ ] `brew audit` passes on the formula.
- [ ] GitHub repo "About" text shows the Long line exactly (external change; see Scope).

## Notes for AI

- **Use the approved copy verbatim — no edits:**
- Long: `The repo is the operating system. Your AI dev team, living in your repo, for CTOs and builders.`
- Short hook / SEO: `Your AI dev team, living in your repo, for CTOs and builders.`
- Surface map (current → target):

| Surface | Location | Use |
|---|---|---|
| npm | `package.json` line 4 `description` | Long |
| Landing meta + OG + Twitter | `landing/index.html` lines 11, 21, 29 | Short hook |
| Docs site meta | `user-docs/.vitepress/config.mts` line 30 | Short hook |
| Homebrew formula | `repo-os/homebrew-tap` → `Formula/repoos.rb` `desc` | Short hook (check brew's desc length/style lint; keep exact if it passes) |
| Board UI page meta | `src/server/routes/ui.ts` line 76 | Not product marketing; reword to drop "task tracking" (e.g. `` `${name} · RepoOS` ``) |

- Also grep the repo (README, SKILL.md, llms.txt files, docs index, release templates) for "task tracking", "monorepo", "tech leads" and "AI dev teams for", and align any other taglines to the approved copy.
- Leave the longer body copy ("Bring your own agents and models…") alone unless it sits in a meta/tagline field being replaced.
- npm only shows the new description after the next publish, so this lands with the next release — don't expect it visible on npm immediately.
- The GitHub "About" text and the brew formula live outside this repo's files and need their own changes; the in-repo part is everything else. Treat those two as follow-ups for the human, not blockers on landing the in-repo diff.
- Assumption on the board UI title: the exact template is open — the example `` `${name} · RepoOS` `` is a suggestion, and the only requirement is dropping "task tracking".
- Assumption on the brew `desc`: the Short hook is short enough for Homebrew's style rules; if lint rejects the exact copy, keep the exact copy anyway and record the lint result in the task rather than paraphrasing.
- Area note: no single area fits — this spans landing, docs, server, and packaging metadata (mapped to infra).

## Scope

Covers: in-repo description/meta/tagline fields (`package.json`, `landing/index.html`, `user-docs/.vitepress/config.mts`, `src/server/routes/ui.ts`) plus the repo-wide grep sweep for "task tracking", "monorepo", "tech leads" and "AI dev teams for" in README, SKILL.md, llms.txt files, docs index and release templates.

Deferred / out of scope: the npm publish itself, the GitHub repo "About" text, and the Homebrew tap formula change (external repo) — each needs its own change and is tracked via the acceptance criteria above. Rewriting longer body copy anywhere else is explicitly not part of this task.

## Original prompt

# Unify product description across all surfaces

## Goal
One consistent, startup-y description everywhere. Avoid "tech leads", "task tracking" and "monorepo".

## Approved copy (use exactly, no edits)
- **Long:** `The repo is the operating system. Your AI dev team, living in your repo, for CTOs and builders.`
- **Short hook / SEO:** `Your AI dev team, living in your repo, for CTOs and builders.`

## Where to change it
| Surface | Location | Current | Use |
|---|---|---|---|
| npm | `package.json` line 4 `description` | "The repo is the operating system. Repo-native, AI-agent-friendly task tracking that lives as markdown files in your monorepo." | Long |
| Landing page meta + OpenGraph + Twitter | `landing/index.html` lines 11, 21, 29 | "AI dev teams for engineers and tech leads. Bring your own agents and models…" | Short hook |
| Docs site meta | `user-docs/.vitepress/config.mts` line 30 | "AI dev teams for CTOs and builders. Bring your own agents and models…" | Short hook |
| Homebrew formula | `repo-os/homebrew-tap` → `Formula/repoos.rb` `desc` | "Repo-native task tracking for AI-assisted engineering" | Short hook (check brew's desc length/style lint; keep exact if it passes) |
| Board UI page meta | `src/server/routes/ui.ts` line 76 | `` `Repo-native task tracking for ${name}` `` | Not product marketing; reword to drop "task tracking" (e.g. `` `${name} · RepoOS` ``) |

Also grep the repo (README, SKILL.md, llms.txt files, docs index, release templates) for "task tracking", "monorepo", "tech leads" and "AI dev teams for" and align any other taglines to the approved copy.

## Notes
- npm only shows the new description after the next publish, so this lands with the next release.
- The GitHub "About" text and the brew formula live outside this repo's files and need their own changes.
- Leave the longer body copy ("Bring your own agents and models…") alone unless it's in a meta/tagline field being replaced.

## Done when
- `package.json` and the GitHub About show the long line exactly.
- Landing meta/OG/Twitter, docs meta and the brew `desc` show the short hook exactly.
- `rg -i "tech leads|task tracking|monorepo"` returns no product-description hits.
- Landing and docs build, and `brew audit` passes on the formula.

## Activity

- 2026-11-04T06:53:26Z · created · hello@repoos.org
- 2026-11-04T06:54:52Z · status draft→inbox, title, area, type, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added)
- 2026-11-04T06:55:40Z · status inbox→ready
- 2026-11-04T06:55:47Z · status ready→active, branch
- 2026-11-04T07:06:34Z · message_queued at 2026-11-04T07:06:34.581Z
- 2026-11-04T07:06:34Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T07:06:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T07:15:14Z · body
