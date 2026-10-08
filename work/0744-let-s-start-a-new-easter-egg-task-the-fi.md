---
id: "0744"
title: "Easter eggs bundle: release freshness visibility"
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-10-08T14:13:48Z"
updated_at: "2026-10-08T16:41:02Z"
---
## Problem

The Releases page does not make it easy to tell how long ago the latest release was cut or how far its commit is behind `main`. This information helps a human judge when it makes sense to cut another release.

## Desired UX

The latest release shows how many commits it is behind `main` and how long ago it was cut, using minute, hour, or day units as appropriate. Make both pieces of information more prominent, taking the Deployments page’s presentation as a reference.

## Acceptance criteria

- [ ] The latest release displays how many commits it is behind `main`.
- [ ] The latest release displays its relative age in minutes, hours, or days, as appropriate.
- [ ] The commit difference and relative age are more visible on the Releases page.

## Notes for AI

- Use the Deployments page’s existing presentation as a reference.
- Assume this information belongs on the Releases page alongside the latest release.

## Scope

This task covers visibility of the latest release’s age and its distance behind `main`. Other release-page changes are out of scope.

## Original prompt

Let's start a new easter egg task, the first item in it will be I want to add info on how far behind main the latest release is (similar to how we show it on the deployments page, that way it's easy for the human to see when it makes sense to cut a release....e.g. last release was cut 2 days ago and it's now 290 commits behind main etc. also please make this info and minute/hour/days ago more visible)

## Screenshots

![Screenshot-2026-10-08-at-22.10.23](/api/tasks/0744/attachments/screenshot-1.png)

## Activity

- 2026-10-08T14:13:48Z · created · hello@repoos.org
- 2026-10-08T14:13:50Z · screenshots
- 2026-10-08T14:14:10Z · status draft→inbox, title, area, body
- 2026-10-08T16:41:02Z · status inbox→ready
