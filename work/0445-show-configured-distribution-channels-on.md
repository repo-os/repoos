---
id: "0445"
title: Show configured distribution channels on Releases
type: feature
status: active
priority: p1
area: release
assigned_to: ai
created_by: ""
branch: feat/show-configured-distribution-channels-on
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-19T10:56:32Z"
updated_at: "2026-09-19T11:18:54Z"
---
## Activity

- 2026-09-19T10:56:32Z · created · unknown


## Problem

RepoOS can cut a GitHub release, publish the npm package, and update its
Homebrew formula, but the Releases page gives no concise answer to the
practical question: “Where can people install this release, and how?”

Release automation can also partially succeed. Without a per-channel view,
maintainers discover a stale npm package or formula only by manually querying
each registry. Users instead need a small, truthful distribution summary next
to the release they are looking at.

This must be project-configured: RepoOS should not assume every repository is
published to npm, Homebrew, or GitHub Releases.

## Desired UX

Add a **Published to** section to the existing Releases page. It is a
distribution summary for the selected/latest release, not a new top-level
navigation page.

For RepoOS itself, show exactly these three configured destinations:

1. **GitHub Releases (curl)** — link to the GitHub release and provide the
   standalone installer command:
   `curl -fsSL https://repoos.org/install | bash`
2. **npm** — link to `@repo-os/repoos`, show the published version/status, and
   offer the install commands for npm, Bun, pnpm, and mise:
   `npm install -g @repo-os/repoos`, `bun add -g @repo-os/repoos`,
   `pnpm add -g @repo-os/repoos`, and `mise use -g npm:@repo-os/repoos`.
3. **Homebrew** — link to the RepoOS tap/formula, show the formula
   version/status, and provide:
   `brew install repo-os/tap/repoos`.

Each command is independently copyable. A release should make the channel
state easy to scan: published and matching, pending/unavailable, failed, or
out of sync (for example npm is 0.5.47 while Homebrew remains 0.5.46). Avoid
claiming a channel is current when its version cannot be verified.

## Acceptance criteria

- [ ] Add a documented, validated `repoos.toml` configuration shape for
  declaring distribution destinations. It should be general enough for other
  projects, without hard-coding RepoOS names, URLs, or package identifiers
  into the feature.
- [ ] The Releases page renders a **Published to** section only when the
  current project has configured destinations; an unconfigured project keeps
  the existing Releases experience without empty marketing UI.
- [ ] The RepoOS project configuration declares GitHub Releases/curl, npm,
  and Homebrew as its three destinations, with the URLs and commands above.
- [ ] The UI presents channel name, configured install variants, copy actions,
  a source link, and a clear version/status for the release being viewed.
- [ ] Channel checks are bounded by timeouts and failures remain local to the
  affected channel; a registry outage must not prevent the Releases page from
  loading or hide the other destinations.
- [ ] If the configured channel reports a different version from the selected
  RepoOS release, show an explicit out-of-sync state rather than “published.”
- [ ] Version/status checks do not expose credentials, registry tokens, or
  repository secrets to the browser.
- [ ] Add focused tests for config parsing/validation, successful status
  lookup, mismatch/unavailable states, and rendering/copying each install
  command.
- [ ] Update user-facing configuration/release documentation with one generic
  example and explain that these are distribution destinations, not deploy
  environments.

## Notes for AI

- Keep this inside Releases for the first iteration. Do not add a standalone
  Channels page or a new primary navigation item.
- “Published to” is preferred wording over “channels” in the visible UI.
- Start with a minimal declarative schema such as a `distribution` section;
  choose final field names to fit existing RepoOS config conventions and
  document comments/examples beside it.
- Build the platform so future destinations (Docker, PyPI, crates.io,
  deploy environments) are possible, but do not implement them in this task.
- Treat install commands as project-owned configured data. Only RepoOS should
  initially expose curl plus npm/Bun/pnpm/mise and Homebrew variants.
- Reuse the existing release/version data and release automation where
  possible. Do not make a GitHub release or registry lookup a prerequisite for
  viewing historical releases offline.

## Activity

- 2026-09-19T11:14:45Z · cli_override
- 2026-09-19T11:14:58Z · model_override
- 2026-09-19T11:18:49Z · model_override
- 2026-09-19T11:18:53Z · status inbox→ready
- 2026-09-19T11:18:54Z · status ready→active, branch
