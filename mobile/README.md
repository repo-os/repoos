# RepoOS Mobile Hub

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
