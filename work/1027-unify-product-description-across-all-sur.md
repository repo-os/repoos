---
id: 1027
title: "# Unify product description across all surfaces"
type: feature
status: draft
priority: p2
area: general
assigned_to: ""
created_by: hello@repoos.org
branch: ""
created_at: "2026-11-04T06:53:26Z"
updated_at: "2026-11-04T06:53:26Z"
---
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
