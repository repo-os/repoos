# RepoOS Hub for iPhone and Android

A privacy-first native shell (iOS + Android) for the RepoOS web UI, built with
Capacitor. It is a **private client**, not a directory or hosted service: the
list of your servers lives on-device only, and your app performs no discovery,
reporting, or central account.

## What it is

- A native **server picker** (add / rename / reorder / select / delete) written
  in Vue + Vite.
- A **chromeless WebView** that loads the *existing* RepoOS web UI for the
  selected server — no tabs, no address/search bar. The RepoOS web app stays the
  primary UI; nothing is duplicated natively.
- Optional **device lock** (biometric or passcode) that gates reopening the app
  or a selected server, independent of each server's own sign-in.

## Architecture

See [`../docs/mobile-architecture.md`](../docs/mobile-architecture.md) for the
full security model, per-origin isolation guarantees, and WebView compatibility
notes (RepoOS email-OTP flow, Cloudflare Access limitations).

## Repo layout

```
mobile/
  src/           the native shell UI (picker + lock) — Vue 3 + TypeScript
  www/           build output (gitignored) served inside the shell + native WebViews
  ios/           generated iOS app (Swift + Capacitor runtime)
  android/       generated Android app (Kotlin + Capacitor runtime)
  capacitor.config.ts
```

## Build

The web shell (`www/`) and native projects are independent of the repo's main
`src/` TypeScript build. From this directory:

```bash
bun install
bun run build        # typecheck + vite builds src/ -> www/
bun run sync         # copy www/ + plugins into ios/ and android/
bun run open:ios     # open Xcode (build + run on device/simulator)
bun run open:android # open Android Studio
```

`bun run add:ios` / `bun run add:android` regenerate the native projects (only
needed if you delete them; they are committed).

### Rapid local testing

From the repo root, `just build-android`, `just build-ios`, and
`just build-mobile` build install-ready artifacts end to end (bun install +
build + sync + native build) without opening Xcode or Android Studio:

```bash
just build-android  # -> mobile/android/app/build/outputs/apk/debug/app-debug.apk
just build-ios      # -> unsigned .app for the iOS Simulator (not a device .ipa)
just build-mobile   # both
```

`build-android` needs `openjdk@21` and the `android-commandlinetools` cask
(`brew install openjdk@21 && brew install --cask android-commandlinetools`).
`build-ios` needs the full Xcode.app installed (Command Line Tools alone
aren't enough) — see [justfile](../justfile) for exact requirements/errors.

### Release signing

The public Android download is a **release-signed** APK attached to each stable
GitHub Release by `.github/workflows/android-hub.yml`. It is never the debug
key, and no signing material is committed: CI writes the keystore from a
repository secret, builds `assembleRelease`, verifies the certificate, and
uploads the file as `RepoOSHub.apk` next to `RepoOSHub.dmg`.

Repository secrets required by the workflow:

| Secret | Purpose |
| --- | --- |
| `REPOOS_ANDROID_KEYSTORE_BASE64` | Base64 of the release keystore (`base64 -i release.keystore`) |
| `REPOOS_ANDROID_KEYSTORE_PASSWORD` | Keystore (store) password |
| `REPOOS_ANDROID_KEY_ALIAS` | Key alias inside the keystore |
| `REPOOS_ANDROID_KEY_PASSWORD` | Password for that key |

Creating the keystore and adding those secrets is a human step. Until they
exist, the workflow skips the APK with a note in the job summary and leaves the
release itself green.

For a local release build, export the same values the Gradle file reads. Use a
real file path, not base64, and a keystore stored **outside** the repo:

```bash
export REPOOS_ANDROID_KEYSTORE_PATH="$HOME/.config/repoos-hub/release.keystore"
export REPOOS_ANDROID_KEYSTORE_PASSWORD='…'
export REPOOS_ANDROID_KEY_ALIAS='repoos-hub'
export REPOOS_ANDROID_KEY_PASSWORD='…'
just build-android-release            # version from mobile/package.json
just build-android-release v0.6.23    # or from a release tag
```

The recipe writes `mobile/app-release.apk` and runs
`mobile/scripts/verify-release-apk.ts`, which compares the APK's certificate
SHA-256 (via `apksigner verify --print-certs`) with the configured keystore and
refuses the Android debug certificate. The same script runs in CI, which puts
the verified fingerprint in the job summary. A release build with no signing
configuration fails with the variable names and a pointer back here; debug
builds need none of it.

`versionName` comes from `REPOOS_APP_VERSION` (the release tag without `v`) or,
when unset, `mobile/package.json`. `versionCode` is derived from that semver as
`major * 10000 + minor * 100 + patch`, so successive releases install over the
previous app. `REPOOS_APP_VERSION_CODE` overrides it if a cut ever needs a
non-semver value.

### Deploy to a phone (Tailscale adb)

```bash
just deploy-phone          # build, install, launch debug APK on the configured phone
just deploy-phone --no-build   # install existing APK only
```

Debug builds install as **`org.repoos.mobile.dev`** (`.dev` suffix) with the launcher label **RepoOS Hub Dev** (`app/src/debug/res/values/strings.xml`) so they sit next to the release **RepoOS Hub** app. See [phone deploy notes](../docs/phone-deploy.md) for adb, Tailscale, Wireless debugging, and `~/.config/repoos-hub/phone`.

## Android SDK note

`@capacitor/inappbrowser` runs loaded servers in an isolated process so their
storage can't touch the shell's. That requires `minSdkVersion = 26` (set in
`android/variables.gradle`) — Android 8.0+. See the plugin's "LocalStorage
Isolation" docs for the API < 28 caveat.

## Privacy choices

- Server URLs + display names are stored in `@capacitor/preferences`
  (UserDefaults / SharedPreferences), never sent anywhere, never backed up to
  cloud (`android:allowBackup="false"`).
- Server auth cookies live in the isolated InAppBrowser WebView container,
  keyed by origin — they persist across app launches like a browser session,
  and are never readable by the shell.
- Server content is loaded only over HTTPS and only in an isolated WebView with
  no Capacitor bridge, so it cannot call privileged native APIs.
