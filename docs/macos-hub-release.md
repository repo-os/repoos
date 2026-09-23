# RepoOS Hub release runbook

This is the release contract for the native **RepoOS Hub** for Mac. Read it
before changing its Xcode product name, distribution workflow, or public
installation copy.

## Artifact contract

- The user-facing app bundle is **`RepoOS Hub.app`**. The Xcode project,
  scheme, Swift module, and bundle identifier remain `RepoOSHub` and
  `org.repoos.hub`.
- The GitHub Release asset is **`RepoOSHub.dmg`**, containing `RepoOS Hub.app`
  on a volume named `RepoOS Hub`.
- `.github/workflows/macos-hub.yml` builds/tests on Mac changes and uploads the
  DMG on version tags.
- The DMG is currently ad-hoc signed and not notarized; documentation must not
  imply Developer ID signing or a warning-free first launch.

## Release checklist

1. Build the Mac Release configuration and verify `RepoOS Hub.app` exists.
2. Merge to `main`, then cut a new patch tag; do not rewrite a failed release
   tag to repair a DMG upload.
3. Confirm the macOS Hub workflow attached `RepoOSHub.dmg`, then inspect it for
   `RepoOS Hub.app`.
4. The release workflow publishes npm before dispatching `repo-os/homebrew-tap`.
   It must wait for the versioned npm tarball: npm can accept a publish before
   the tarball is publicly downloadable.
5. Confirm the tap updates `Formula/repoos.rb`, then test `brew update && brew
   upgrade repo-os/tap/repoos`.
6. Once the first DMG is live, replace “first DMG pending” copy in the README,
   landing page, and `user-docs/macos-hub.md` with the real download link.

## Failure triage

- A built `RepoOS Hub.app` with a missing DMG usually means the workflow path
  still names the old bundle; fix the path and release a new patch version.
- A tap 404 for the npm tarball is registry propagation, not a formula checksum
  failure. Retry only after the tarball is public and retain the release wait.
- A Gatekeeper warning is currently expected. Revisit docs only when signing or
  notarization policy changes.
