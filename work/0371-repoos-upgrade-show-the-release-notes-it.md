---
id: "0371"
title: "repoos upgrade: show the release notes it already fetches, not just the version bump"
type: feature
status: inbox
priority: p2
area: cli
assigned_to: ai
created_by: ""
branch: feat/repoos-upgrade-show-the-release-notes-it
created_at: "2026-09-16T06:39:39Z"
updated_at: "2026-09-16T06:39:44Z"
---
## Problem

User-reported: after \`repoos upgrade\`, the terminal shows only the version
bump:

\`\`\`
repoos upgrade
  Current version: v0.5.42
  Checking latest release…
  Upgrading v0.5.42 → v0.5.44…
  Upgraded to v0.5.44.
\`\`\`

Since #0361, releases can carry human-readable (optionally AI-drafted) notes,
and \`cmdUpgrade\` (src/commands/upgrade.ts) already fetches the release object
from GitHub's API (\`fetchLatestRelease\`) — that response includes a \`body\`
field with exactly these notes. The code just never reads or prints it: the
local \`Release\` interface only types \`tag_name\`, \`assets\`, \`prerelease\`.

## Desired outcome

Add \`body?: string\` to the \`Release\` interface and print it after a
successful upgrade (after the "Upgraded to vX." line), when non-empty. Skip
printing anything extra when the release has no notes (empty body) — same as
today's silent behavior, no "no notes available" filler.

## Notes for AI

- Relevant code: src/commands/upgrade.ts (\`Release\` interface,
  \`fetchLatestRelease\`, \`cmdUpgrade\`'s final console.log).
- The body is markdown (GitHub release body) — printing it close to raw in
  the terminal is fine and matches how most CLIs show changelogs; no need to
  strip markdown syntax, just maybe trim trailing whitespace and cap
  pathological length if worth the trouble (use judgment, don't over-engineer
  for a case that won't come up in practice).
- Both the stable path (\`fetchLatestRelease(null)\`, hits \`/releases/latest\`)
  and the channel path (\`fetchLatestRelease(channel)\`, hits \`/releases\` list)
  return the same \`Release\` shape from GitHub's API — both already include
  \`body\` for free once the type declares it, no extra API call needed.
- Existing tests: check for an upgrade.test.ts or similar covering
  cmdUpgrade/fetchLatestRelease — extend it for this rather than skipping
  coverage. If none exists, a small one exercising the new print (mock fetch
  returning a release with/without a body) is worth adding.
- \`repoos check\` passes.

## Activity

- 2026-09-16T06:39:39Z · created · unknown
- 2026-09-16T06:39:44Z · branch
