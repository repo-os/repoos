# RepoOS Hub release runbook

This is the release contract for the native **RepoOS Hub** for Mac. Read it
before changing its Xcode product name, distribution workflow, or public
installation copy.

## Artifact contract

- The user-facing app bundle is **`RepoOS Hub.app`**. The Xcode project,
  scheme, Swift module, and bundle identifier remain `RepoOSHub` and
  `org.repoos.hub`.
- The GitHub Release asset is **`RepoOSHub.dmg`**, containing `RepoOS Hub.app`
  and an **Applications** alias on a volume named `RepoOS Hub`. Its saved
  Finder layout has the branded background, installation copy, and app →
  Applications arrangement expected of a normal drag-to-install Mac app.
- The layout comes from `macos/dmg-settings.py`, rendered by the release-only,
  pinned `dmgbuild` tool. It writes the DMG metadata directly; do not replace
  it with Finder or AppleScript automation. That is nondeterministic in CI and
  can disrupt an interactive Mac session.
- `.github/workflows/macos-hub.yml` builds/tests on Mac changes and uploads the
  DMG on version tags. It must compile `AppIcon.icns` into the release bundle
  and inject the tag version into the app bundle; both are release checks.
- The DMG is currently ad-hoc signed and not notarized; documentation must not
  imply Developer ID signing or a warning-free first launch.

## Release checklist

1. Build the Mac Release configuration and verify `RepoOS Hub.app` exists.
2. Merge to `main`, then cut a new patch tag; do not rewrite a failed release
   tag to repair a DMG upload.
3. Confirm the macOS Hub workflow attached `RepoOSHub.dmg`, then inspect it for
   `RepoOS Hub.app`, its branded Finder icon, Applications alias, background,
   and saved app → Applications layout.
4. The release workflow publishes npm before dispatching `repo-os/homebrew-tap`.
   It must wait for the versioned npm tarball: npm can accept a publish before
   the tarball is publicly downloadable.
5. Confirm the tap updates `Formula/repoos.rb`, then test `brew update && brew
   upgrade repo-os/tap/repoos`.

## Failure triage

- A built `RepoOS Hub.app` with a missing DMG usually means the workflow path
  still names the old bundle; fix the path and release a new patch version.
- A generic Finder icon means the release bundle is missing `AppIcon.icns`.
  Do not ship it: make the AppIcon catalog use default macOS slots, not only
  light/dark appearance variants, then confirm the workflow's icon check.
- A tap 404 for the npm tarball is registry propagation, not a formula checksum
  failure. Retry only after the tarball is public and retain the release wait.
- A Gatekeeper warning is currently expected. Revisit docs only when signing or
  notarization policy changes.
