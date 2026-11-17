# RepoOS Hub for Android

RepoOS Hub for Android is the mobile companion for the RepoOS servers you run
yourself. It keeps a **server list on your device**, then opens each server's
ordinary RepoOS web UI in an isolated WebView — no second RepoOS account, no
hosted directory, and no copy of your board on anyone else's machine.

It is the same privacy-first shell as the [macOS Hub](/macos-hub), sized for a
phone: pick a server, sign in the way that server already asks you to, and work
against the live board.

## Download and requirements

- **Requires Android 8.0 (API 26) or newer.** The isolated WebView that loads
  server content needs API 26.
- Download the latest [RepoOS Hub APK](https://github.com/repo-os/repoos/releases/latest/download/RepoOSHub.apk),
  or browse [all RepoOS releases](https://github.com/repo-os/repoos/releases).
  Stable tags include `RepoOSHub.apk` next to the macOS `RepoOSHub.dmg`.

The app is **not on the Play Store yet**. You install it by sideloading the
APK, so Android will ask you to allow installs from the app you downloaded it
with (usually Chrome or your file manager).

Release APKs are signed with the RepoOS release key, never the Android debug
key. If signing secrets are not configured for a release, that release simply
has no APK — the download link then points at the newest release that does.

## Install the APK

1. Download `RepoOSHub.apk` on the phone.
2. Open it from the browser's download notification, or from **Files →
   Downloads**.
3. Android may block the first attempt with **"For your security, your phone
   is not allowed to install unknown apps from this source."** Tap
   **Settings**, enable **Allow from this source**, then go back.
   The path varies slightly by manufacturer, and on stock Android it is
   **Settings → Apps → Special app access → Install unknown apps → \<the app
   you downloaded with\> → Allow**.
4. Tap **Install**, then **Open**.

Google Play Protect may warn that the app is unknown or unscanned. That is
expected for a sideloaded app without Play Store distribution; only continue if
you downloaded it from the RepoOS releases page. If you do not want to keep
allowing installs from that browser, turn the permission back off after
installing.

The release app installs as **RepoOS Hub** (`org.repoos.mobile`). A debug build
made with `just build-android` installs alongside it as **RepoOS Hub Dev**
(`org.repoos.mobile.dev`), so you can keep both.

## Verify the signing certificate

Before installing an APK you downloaded, confirm it carries the RepoOS release
certificate. `apksigner` ships with the Android SDK build-tools:

```sh
apksigner verify --print-certs RepoOSHub.apk
```

The output includes a line like:

```text
Signer #1 certificate SHA-256 digest: <64 hex characters>
```

Compare that SHA-256 with the **release certificate SHA-256** printed in the
`Release Android Hub APK` job summary of the [Android Hub workflow
run](https://github.com/repo-os/repoos/actions/workflows/android-hub.yml) that
published the release you downloaded. The same fingerprint is used for every
release signed with the current key; it changes only if the signing key is
rotated. This guide deliberately does not hard-code a fingerprint — the
authoritative value comes from the signing run, and a value copied into a doc
could drift.

`apksigner` also fails outright if the APK is unsigned or its signature does
not verify. Treat any APK whose fingerprint does not match as not ours and do
not install it, even if the filename is right.

If you do not have the Android SDK, Android Studio's **Build → Analyze APK**
shows the same certificate digest without a command line.

## Updates

Updates are APK installs, not store updates:

1. Download the newer `RepoOSHub.apk` from
   [GitHub Releases](https://github.com/repo-os/repoos/releases/latest).
2. Open it and install it over the existing app.

Android allows the install because the package name stays
`org.repoos.mobile`, the signing certificate is unchanged, and each release's
`versionCode` is higher than the previous one. Your server list, preferences,
and signed-in WebView sessions normally survive an update, because Android
keeps app data across an in-place upgrade.

If Android says **App not installed** or reports a signature mismatch, stop:
the APK is not signed with the same key as the installed app. Do not uninstall
the old app just to force it through — that deletes its local data and would
paper over a bad download. Re-download from the RepoOS releases page and
compare the certificate as above.

Only stable releases are offered by the `latest/download` link. Prerelease tags
can also carry an APK; they are listed on the releases page but do not take the
"Latest" badge.

## Privacy and security

- **Your servers stay on the device.** Server addresses and display names live
  in Android app storage, are never sent to RepoOS, and are excluded from
  Android's cloud backup (`android:allowBackup="false"`).
- **Each server gets an isolated WebView.** Server content runs without the
  Capacitor bridge, so it cannot call native APIs or read another server's
  storage. Sign-in cookies stay in that isolated container.
- **No network scanning.** The app does not scan your network, report usage, or
  create a central account. You add a server by its exact HTTPS origin (loopback
  HTTP is supported for local development). Optional **Find servers on my
  tailnet** asks one server you already saved for the RepoOS servers it can see;
  the phone itself never scans or broadcasts.
- **Discovery results stay local.** Only the rows you explicitly select are
  saved, and the server is never told which rows you chose.

The full threat model, origin-isolation guarantees, and WebView compatibility
notes live in [`docs/mobile-architecture.md`](https://github.com/repo-os/repoos/blob/main/docs/mobile-architecture.md).

## Open a server and return to the picker

Tap a server to open its RepoOS web UI. On a phone the top bar keeps the current
project name visible and turns search into a compact icon button. To leave the
server and go back to the Hub's server picker, tap the RepoOS mark at the top
left: it returns to the picker in one action, however many pages you visited in
the server. The sign-in screen's mark works the same way if your session
expires. Android's system back still moves through the server's own history.

The logo is a Hub-only control. In a normal phone or desktop browser the same
mark is decorative, and the desktop top bar keeps its branch label and full
search field.

## Find servers on my tailnet

Once you have saved one server you trust, the picker offers **Find servers on my
tailnet**. The phone makes one request to that saved server; the server runs
`tailscale status` and SSH on its own machine and returns the RepoOS servers it
can see, with HTTPS MagicDNS URLs. Your phone never scans the tailnet. Peers are
identified by their MagicDNS names, so two machines with the same display name
stay distinct and a Mac with spaces in its name is still reached correctly.
Phones and tablets on the tailnet are skipped because they cannot run a RepoOS
server.

The request is a normal authenticated API call, so the saved server must have a
signed-in session for it to succeed. The native app's isolated WebView session
is not available to the shell, so an auth-enabled server may answer with a
sign-in message. Use the web Hub served from that same origin (where the session
cookie is sent), or add the server by URL. Reachable rows with an HTTPS URL can
be selected and added; plain-HTTP rows stay visible with a **Needs HTTPS** note.

## Troubleshooting

### The install is blocked and I can't find "unknown sources"

Modern Android grants install permission per source app: whichever app saved
the APK (Chrome, Files, Drive) needs **Install unknown apps** allowed. Search
Settings for "install unknown apps", or open **Settings → Apps → Special app
access → Install unknown apps**.

### "There was a problem parsing the package"

The download is incomplete or corrupt. Delete it and download again from the
[releases page](https://github.com/repo-os/repoos/releases/latest); do not
rename or re-zip the file.

### The app opens but a server won't connect

The Hub requires HTTPS for remote servers; plain HTTP is accepted only for
loopback addresses (`localhost`, `127.0.0.1`, `::1`). For a server on your own
machine, use its loopback address, or publish it over HTTPS with a
[tunnel](/tunnels). See [Troubleshooting](/troubleshooting) for server-side
sign-in problems.

### I want to remove the app and its data

Uninstalling **RepoOS Hub** from Android Settings removes the app, its server
list, and its isolated WebView data. There is no cloud copy to clean up.

## Further reading

- [RepoOS Hub for Mac](/macos-hub) — the desktop companion.
- [Authentication](/authentication) — how server sign-in works.
- [Tunnels](/tunnels) — publishing a local server for a remote Hub.
- [Mobile architecture and privacy model](https://github.com/repo-os/repoos/blob/main/docs/mobile-architecture.md).
