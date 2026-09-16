---
id: "0372"
title: Add a Releases/Changelog page to the docs.repoos.org VitePress site
type: feature
status: review
priority: p3
area: docs
assigned_to: ai
created_by: ""
branch: feat/add-a-releases-changelog-page-to-the-doc
created_at: "2026-09-16T06:55:11Z"
updated_at: "2026-09-16T08:04:58Z"
review_passes: 1
---
## Problem

There's no changelog anywhere in the user-facing docs. Release notes exist
(tag annotation body -> GitHub Release body -> now also `repoos upgrade`'s
terminal output, #0361/#0371) but the only place to read them today is the
GitHub Releases page directly.

## Desired outcome

A "Releases" (or "Changelog") page in `user-docs/` (VitePress,
docs.repoos.org), doing BOTH of the two approaches discussed rather than
picking one:

1. **Fetch-and-embed**: at build time, fetch recent releases from GitHub's
   API (`GET /repos/repo-os/repoos/releases`) and render them on the page —
   version, date, and the notes body (the same markdown already written into
   the tag/GitHub Release). Cap it to a reasonable recent window (e.g. last
   10-20 releases, or last N months) rather than the entire history, to keep
   the page and the build fetch bounded.
2. **Link-out for the rest**: below (or alongside) the embedded recent
   releases, a plain link to the full GitHub Releases page
   (https://github.com/repo-os/repoos/releases) for anything older than the
   embedded window, and as the authoritative source if the embed is ever
   stale between deploys.

No API key needed for the fetch: this is a PUBLIC repo, and GitHub's REST API
serves public-repo releases unauthenticated
(`GET /repos/{owner}/{repo}/releases`) — no `Authorization` header required.
Unauthenticated rate limit is 60 requests/hour per IP, which is trivially
enough for one fetch per docs build. Only bother adding auth if the docs
build ever actually hits that limit in practice (e.g. very frequent CI
rebuilds sharing a runner IP with other unauthenticated GitHub API traffic) —
if so, GitHub Actions already exposes a `GITHUB_TOKEN` for free in that
context (no new secret to manage), which raises the limit to 5000/hour; don't
add this preemptively without evidence it's needed.

## Notes for AI

- Source of truth for what a release's notes actually are:
  `.github/workflows/release.yml` reads the annotated tag's body
  (`git tag -l --format='%(contents:body)'`) into the GitHub Release. The
  VitePress page should read from GitHub's Releases API (the `body` field on
  each release object), not re-derive from tags directly — the API is the
  simpler, already-public surface and matches what `repoos upgrade` (#0371)
  and the GitHub Releases page itself show.
- This is a VitePress site (`user-docs/`) — check how its build is invoked
  today (`just user-docs-build` per AGENTS.md) to decide whether the fetch
  belongs in a `.vitepress/config.mts` `buildEnd`/data-loader hook (VitePress
  has a documented data-loading pattern for build-time fetches — use it
  rather than a bespoke script if it fits) or a separate pre-build script.
  `repoos check` does NOT cover `user-docs/` (see docs/README.md /
  user-docs/README.md) — verify locally with `just user-docs-dev` /
  `just user-docs-build` instead.
  markdown; render it as-is (VitePress/vue can render raw markdown-in-markdown
  via its own pipeline, or a lightweight client-side render — avoid pulling in
  a new heavy markdown-rendering dependency if VitePress's own tooling can do
  it, since zero-runtime-deps is a hard constraint for the main repoos
  package, though user-docs/ has its own separate package.json and existing
  VitePress/markdown tooling to lean on).
- Add the new page to `user-docs/.vitepress/config.mts`'s hand-curated sidebar
  (it does not auto-generate from the file tree) or it won't appear in nav.
- Handle the fetch failing gracefully at build time (network blip, rate
  limit) — don't hard-fail the whole docs build over a transient GitHub API
  hiccup; consider whether a stale/missing embed with the link-out still
  present is an acceptable degraded state, or whether the build should retry/
  warn instead.

## Activity

- 2026-09-16T06:55:11Z · created · unknown
- 2026-09-16T07:45:16Z · status inbox→ready
- 2026-09-16T07:45:21Z · status ready→active, branch
- 2026-09-16T07:49:08Z · status active→review
- 2026-09-16T08:04:58Z · area
