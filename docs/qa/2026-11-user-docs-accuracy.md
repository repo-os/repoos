# User-docs accuracy QA — November 2026

Compared the requested user-docs topics with current CLI, server, configuration,
and UI behavior in this worktree.

## Changes made

- Replaced the obsolete planned-feature description in
  `user-docs/remote-engineers.md`. Managed engineer sessions and task worktrees
  remain on the RepoOS host; configured remote validation can run install,
  build, and tests for a managed engineer's self-check, with format and lint
  local. Documented the shipped option, default, runner setup pointers, and
  work-location boundary.
- Clarified that `remoteValidation.engineerSelfCheckRemote` defaults on when
  remote validation is enabled and that setting it false runs the entire
  self-check locally.

## Reviewed without changes

- `user-docs/macos-hub.md`: current stable-only update check, six-hour result
  cache with manual recheck, external DMG download flow, server health checks,
  local service controls, window layouts, and per-server sessions match the
  current Hub behavior described by the app.
- `user-docs/android-hub.md`: APK update/signing guidance and tailnet discovery
  flow match the Android Hub documentation and discovery implementation,
  including querying through a saved server, HTTPS selection, peer filtering,
  and no phone-side network scan.
- `user-docs/configuration.md`: `tailnetDiscovery` is enabled by default and
  applies per project; remote runner pool edits through Settings apply to the
  live dispatcher. The documented check setting matches the config schema.
- `user-docs/check.md`: project-declared `[[check.steps]]`, path-scoped checks,
  self-check reuse, and full-profile close-out behavior match the current check
  implementation.
- `user-docs/deployments-and-releases.md`: verified release gating, prerelease
  handling, AI draft/publish behavior, and distribution details against the
  Releases page and server flow; no stale user-facing claims found in the
  reviewed sections.

## QA notes

No implementation bug was uncovered that requires a code change. This was a
documentation-only review; no device-specific live test was performed.
