# RepoOS mobile hub — architecture & WebView compatibility

Task #0297. This doc is the acceptance-criterion deliverable for "documents
WebView compatibility results for RepoOS auth and the chosen Capacitor
architecture."

## Chosen architecture: Capacitor + a thin Vue shell + isolated WebView

The spike compared three ways to load an untrusted, user-supplied server
inside a native shell, and settled on **Capacitor** with
**`@capacitor/inappbrowser`**:

| Approach | Browser chrome | Isolation from native bridge | Why rejected / chosen |
| --- | --- | --- | --- |
| Main Capacitor WebView (`window.location` to server) | none | **none** — server JS runs in the app WebView with full `Capacitor.Plugins` access | Rejected: violates "arbitrary servers cannot call privileged native APIs" |
| `@capacitor/browser` (SFSafariViewController / Custom Tabs) | native "Done" + domain bar always visible | strong (system browser) | Rejected: shows iOS browser chrome, weakens "no address bar" criterion |
| **`@capacitor/inappbrowser` `openInWebView`** | none (`showToolbar: false`, `showURL: false`) | strong (separate process / isolated container, no bridge) | **Chosen** |

`@capacitor/inappbrowser` is Capacitor's own plugin for loading *untrusted*
content. Its docs are explicit that it is "useful to load untrusted content
without risking your application's security." That is exactly this task's
threat model.

### How the security boundary works

1. **The shell's own UI** (server picker, lock screen) runs in Capacitor's
   main WebView, served from the bundled `www/` assets. It is the only code
   that sees the Capacitor bridge and the native plugins (`Preferences`,
   biometric lock, `InAppBrowser`).
2. **Server content** is opened via `InAppBrowser.openInWebView(...)` into a
   *separate* WebView that has no Capacitor runtime injected. A joined server
   loaded there cannot reach `Capacitor.Plugins.*` — there is nothing native
   exposed to it. This is the acceptance criterion "arbitrary joined servers
   cannot call privileged native APIs merely because they are loaded inside
   the app."
3. **Per-origin session/storage isolation** comes from the WebView container:
   - iOS: InAppBrowser storage is isolated by default.
   - Android (API 28+): the InAppBrowser runs in its own process
     (`:OSInAppBrowser`) with a dedicated data directory.
   Cookies and `localStorage` are keyed by origin inside that container, so
   `dev.repoos.org` and `celleris.repoos.org` keep separate sessions, and
   those sessions **persist across app launches** like a browser — which is
   the acceptance criterion "a server-authenticated session survives app
   relaunch."
   - Android API < 28 cannot isolate (platform limitation, documented in the
     plugin README); we set `minSdkVersion = 26` (the plugin's floor) and note
     the <28 caveat in `mobile/README.md`.

### What stays on-device

- The server list (URL + display name + order + selection) is stored in
  `@capacitor/preferences` (UserDefaults / SharedPreferences). No network call
  ever transmits it — the only outbound requests are the explicit
  reachability check to the URL the user typed, and opening that URL in the
  WebView.
- No server discovery, no central account, no report home.
- `android:allowBackup="false"` prevents the server list from sync'ing to
  Google backup; iOS stores it in plain UserDefaults (no credentials are ever
  held, so keychain is unnecessary).

### HTTPS-only, reachability-gated add flow

`src/reachability.ts` enforces, before a server can be saved:

1. Normalize the input; require an `https:` origin (explicitly entered `http://`
   is rejected).
2. `fetch(origin + "/api/health")` with a timeout. A server is only saved if it
   answers 2xx on the RepoOS health endpoint.

This is both the "validates HTTPS and reachable" UX step and a guard against
saving garbage. The `select` path (opening the WebView) does **not** re-verify —
it is the user's explicit "open this" action — but the shell shows the picker
again immediately when the WebView closes, and never fabricates an offline
RepoOS session: if a server is unreachable, the WebView shows the platform's
own error/chrome rather than pretending the RepoOS UI works offline. (The app
is "useful offline" only for the local picker and the lock screen, per the
scope.)

## RepoOS auth (email OTP) in the WebView — compatibility

RepoOS native auth (see `docs/native-auth.md`) is cookie-based: `HttpOnly`,
`SameSite=Lax`, `Secure` over HTTPS, server-side sessions. Within the isolated
InAppBrowser WebView:

- **Works**: the RepoOS `/login` page loads, the email-OTP flow completes, the
  session cookie is set on the server's origin, and it persists in the
  isolated storage across `openInWebView`/close cycles and app relaunches —
  exactly the "persists across app launches like a browser session"
  requirement.
- **Session rotation on login** is transparent; the WebView sets/overwrites the
  cookie like any browser.
- **SameSite=Lax** is fine here: the WebView's top-level navigation to the
  server is a same-origin (top-level GET) request, so Lax cookies are sent.
- **Google OAuth** (optional provider) opens Google's consent screen inside the
  WebView. Google may block sign-in from embedded webviews depending on the
  OAuth client's "embedded browsers" policy (Google's redirect/cookie policy
  for WKWebView/Android WebView is stricter than desktop). If a deployment uses
  Google OAuth, it should prefer `openInSystemBrowser` for the /login step or
  rely on email OTP. This is a Google-side policy, not a RepoOS defect.

## Cloudflare Access / WebView limitations

- **Cloudflare Tunnel** (native auth only, `--no-access`): fully compatible.
  The WebView presents the RepoOS login and normal sessions work.
- **Cloudflare Access** (SSO/IdP, device posture, IP rules) in front of a
  tunnel: Access's own challenge runs in the WebView. Common, known WebView
  limitations apply and are **not specific to this app**:
  - Some IdPs (Google, Okta) block or degrade sign-in inside embedded WebViews
    and require a system browser. If a server is behind such an IdP, the user
    may need to fall back to the system-browser route.
  - Access's device-posture / client-certificate checks may not surface
    correctly in an isolated WebView (no Enterprise-managed cert store).
  - Because the InAppBrowser WebView is isolated, any Access session cookie
    lives only in that container; it will not leak to the shell or to other
    servers.
- Nothing in this app attempts to *bypass* Cloudflare Access; it simply renders
  whatever the server returns in a sandboxed WebView, the same way a browser
  would but with no address bar.

## Native project specifics shipped

- `mobile/ios/` — generated Xcode project; added `NSFaceIDUsageDescription`.
- `mobile/android/` — generated Gradle project; `minSdkVersion = 26`,
  `android:allowBackup="false"`, `USE_BIOMETRIC` permission.
- Plugins: `@capacitor/app`, `preferences`, `keyboard`, `status-bar`,
  `haptics`, `inappbrowser`, `@capgo/capacitor-native-biometric`.

## Build independence from the main repo

`mobile/` has its own `package.json`, `tsconfig.json`, and `vite.config.ts`; it
does not add any runtime dependency to the `repoos` package (which keeps its
zero-runtime-dependency guarantee — see AGENTS.md). `repoos check` builds
`src/` and smokes the RepoOS UI; `mobile/` is built separately
(`cd mobile && bun install && bun run build`), and is genuinely usable on the
web (`bun run dev`) for picker testing without a device.
