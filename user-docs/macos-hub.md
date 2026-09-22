# RepoOS Hub for Mac

RepoOS Hub is a native macOS app that gives you a persistent sidebar for all
your RepoOS servers — local or remote. It wraps the board UI in an isolated
window per server, with native notifications, a Dock badge, and a ⌘K switcher
across servers and tasks.

## Download

[Download RepoOS Hub (.dmg)](https://github.com/repo-os/repoos/releases/latest/download/RepoOSHub.dmg)

Requires macOS 14 or later.

## Install

1. Open the downloaded `.dmg` file.
2. Drag **RepoOS Hub** into your **Applications** folder.
3. Eject the disk image.

## First launch (Gatekeeper)

Because the app is not notarized, macOS will block it the first time:

> "RepoOS Hub cannot be opened because it is from an unidentified developer."

To open it anyway:

- **Right-click** (or Control-click) the app in Finder and choose **Open**, then
  click **Open** in the dialog. You only need to do this once.

Alternatively, from Terminal:

```sh
xattr -dr com.apple.quarantine /Applications/RepoOSHub.app
```

After the first launch, the app opens normally.

## Add a server

Click **+** in the sidebar and enter your server's address (e.g.
`http://localhost:7171` for a local instance). The Hub calls `/api/health`,
confirms it's a RepoOS server, and saves it. The sidebar name comes from the
server's reported repository name.

## Updates

Download the latest `.dmg` from the
[releases page](https://github.com/repo-os/repoos/releases) and repeat the
install steps. Your server list is stored in `~/Library/Application Support/RepoOSHub/`
and is preserved across updates.
