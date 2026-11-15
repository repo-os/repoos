# RepoOS Hub phone deploy

Install a debug build of the Hub Android app on Nick's phone with one command:

```bash
just deploy-phone
```

The script (`scripts/deploy-phone.ts`) builds the debug APK in `mobile/android`, connects over Tailscale + adb, installs with `adb install -r -d`, force-stops any running instance, launches `org.repoos.mobile.dev`, and prints the short git commit.

Flags:

- `--no-build` — install the existing APK only
- `--no-scan` — do not scan for a new Wireless debugging port; fail if the saved address does not answer

## One-time setup on the Mac

- `brew install --cask android-platform-tools` (adb)
- JDK 17 or 21 and the Android SDK — same requirements as `just build-android` (`openjdk@21`, `android-commandlinetools`)
- Tailscale on the Mac and on the phone (same tailnet)

Phone address (never committed to the repo):

1. `REPOOS_HUB_PHONE=ip:port`
2. `REPOOS_HUB_PHONE_PORT=port` (IP from the config file below)
3. `~/.config/repoos-hub/phone` — one line, `ip:port`

The Tailscale IP is stable; the Wireless debugging port changes when Android restarts that feature or the phone changes networks. When the saved port fails, the script scans TCP ports 30000–49999 on the phone IP (nmap if installed, otherwise a socket scan) and saves the working address.

## Connection modes on the phone

**Fixed port 5555** — after a one-time USB `adb tcpip 5555`, adb may reach `tailscale-ip:5555`. That survives until a reboot or network change clears it.

**Wireless debugging** — Developer options → Wireless debugging → "IP address & port". The port is random and resets when Wireless debugging restarts. Only one wireless adb session is allowed at a time; deploying from another machine can disconnect this one.

**Tailscale quirk** — if the phone shows a warning triangle on Tailscale, toggling Tailscale off and on on the phone often fixes adb connectivity.

## Debug vs release application id

Debug builds use `applicationIdSuffix ".dev"` in `mobile/android/app/build.gradle`, so the installed package is **`org.repoos.mobile.dev`** and sits beside a release **`org.repoos.mobile`** install. Release builds are unchanged. The debug variant overrides `app_name` and `title_activity_main` in `app/src/debug/res/values/strings.xml` to **RepoOS Hub Dev**; release strings in `src/main` stay **RepoOS Hub**. `just deploy-phone` logs the app id and label when installing.

The launch component is always fully qualified: `org.repoos.mobile.dev/org.repoos.mobile.MainActivity` (not a leading-dot `.MainActivity`, which would resolve against the suffixed id and fail).

## When the phone is unreachable

The script prints what to check on the phone (Tailscale connected, Wireless debugging on, current port) and how to retry with `REPOOS_HUB_PHONE_PORT=<port> just deploy-phone --no-build` or an updated `~/.config/repoos-hub/phone` file.

Pairing after a phone reset is manual (`adb pair ip:pairing-port code`) and is not run by this script.

## Signature mismatch

If install fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, uninstall the dev package once:

```bash
adb -s <serial> uninstall org.repoos.mobile.dev
```

Then run `just deploy-phone` again.