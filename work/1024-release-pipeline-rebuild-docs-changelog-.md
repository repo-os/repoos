---
id: 1024
title: "Release pipeline: rebuild docs, changelog, llms files and release notes on every release"
type: bug
status: ready
priority: p1
area: [core, docs]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-04T06:45:38Z"
updated_at: "2026-11-04T12:58:45Z"
---
## Problem
v0.5.75 QA found the release leaves public surfaces stale: docs.repoos.org/changelog stops at v0.5.74, changelog.md "Recent releases" is empty, llms-full.txt is stale (docs built 11:07 SGT, release published 11:49 SGT). GitHub release notes for v0.5.73–75 are empty apart from a "Full Changelog" link. No current version/date is shown on repoos.org, llms.txt or docs. Guessable agent URLs 404: repoos.org `/llms-full.txt`, `/AGENTS.md`, `/.well-known/llms.txt`, `/docs`; repo `CHANGELOG.md`.

## Desired UX
- Docs site (changelog, llms.txt, llms-full.txt) is rebuilt and published as part of the release pipeline, after the version bump, so it always reflects the latest release.
- GitHub release notes contain the real changelog entry.
- repoos.org, llms.txt and docs show the current version and release date.
- The guessable agent URLs above resolve (redirect or serve) or are deliberately documented as absent.

## Acceptance criteria
- [ai] Release pipeline rebuilds docs after the version bump; a test or dry-run proves changelog and llms files contain the new version.
- [ai] GitHub release body is populated from the changelog entry.
- [ai] Version + release date appear on the landing page, llms.txt and docs.
- [ai] The listed 404 URLs are resolved or consciously dropped, with a note.

## Notes for AI
Source: external QA report on v0.5.75 (items 2, 6, 19). Left out: SEO polish (sitemap, OpenGraph, license/topics) — separate. Product description wording (item 7) is pending a human decision; do not touch it.

## Activity

- 2026-11-04T06:45:38Z · created · njachowski@gmail.com
- 2026-11-04T12:58:45Z · status inbox→ready
