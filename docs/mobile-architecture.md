# RepoOS mobile hub — architecture & WebView compatibility

> **Direction update (ADR 0011):** For connected-server screens, the native
> screen-composition direction documented here is superseded by the
> [purpose-built mobile web UI](adr/0011-mobile-web-ui.md): RepoOS serves one
> SPA with a narrow-screen composition in the browser and in the host WebView.
> The Capacitor host remains responsible for server selection, the lock screen,
> and the isolated WebView security boundary; this document's security and
> compatibility findings continue to apply.

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
  ever transmits it. The outbound requests are: the explicit reachability check
  to a URL the user typed, the one discovery request described below to a
  server the user already saved, and opening that URL in the WebView.
- The phone performs **no scanning, probing or broadcasting** of the local
  network or the tailnet. There is no central account and no report home.
- `android:allowBackup="false"` prevents the server list from sync'ing to
  Google backup; iOS stores it in plain UserDefaults (no credentials are ever
  held, so keychain is unnecessary).

### System back navigation (Android)

The picker is the shell's root; settings, add-server and tailnet discovery are
local Vue routes, not browser history entries. Capacitor's App plugin consumes
the Android back gesture whenever a `backButton` listener exists, so the shell
maps it explicitly (`mobile/src/back-navigation.ts`): an open edit sheet closes,
any other Hub route returns to the picker (signed-out, loading, empty and
errored discovery all included), and only the picker root exits the app. A
showing device-lock gate ignores the gesture. iOS and the web dev build keep
their platform-native behaviour. The mapping and listener wiring are covered by
`src/ui-app/tests/mobile-hub-back-navigation.test.ts`.

### Returning to the server picker from a connected server (#1152)

Android's system back walks the isolated WebView's history; a server with many
pages therefore takes many gestures to leave. The top-left RepoOS mark is the
one-action return, and it does **not** add a native bridge:

1. `openServer` (`mobile/src/browser.ts`) generates a fresh 128-bit token for
   each open and appends it to the server URL as `?repoos_hub=<token>`.
2. The server-served SPA (`src/ui-app/src/lib/hub-shell.ts`) reads the token,
   remembers it in `sessionStorage` so a login round-trip can return to it, and
   removes the parameter from the visible URL. When the user activates the
   logo, it performs a full-page navigation to
   `/__repoos_hub/return-to-picker#hub-return=<token>`. The fragment keeps the
   token out of the HTTP request. The login screen's existing logo is the same
   return action, so an expired session does not trap the user.
3. The server answers that path with a tiny public, script-free landing page
   (`serveHubReturn`) so the navigation completes immediately.
4. The shell's existing `browserPageNavigationCompleted` listener accepts it
   only when the URL's origin is exactly the origin it opened, the path is
   exactly the return path (or a `blob:` document on that origin), and the
   fragment carries **this open's** token; then it closes the InAppBrowser.
   Every other navigation continues normally.

Before navigating, the SPA probes the landing page with a short deadline. If
the server or network is down, that navigation would never complete and the
WebView would stay open, so it falls back to an in-memory `blob:` document with
the same origin and token (and a link back to the server). That needs no
network and still satisfies the shell's origin/token check.

This is the existing supported navigation contract, not a privileged API. An
untrusted same-origin page could at most dismiss its own browser view; it
cannot invoke native plugins, read the server list, or change another server's
state. A foreign origin never loads in the isolated WebView (it opens in the
system browser) and a stale token from an earlier app open never matches the
shell's current in-memory token. In an ordinary browser there is no token, so
the logo stays decorative and desktop behavior is unchanged. The contract and
its rejection cases are covered by `src/ui-app/tests/mobile-hub-return.test.ts`.

### Server-assisted tailnet discovery ("Find servers on my tailnet")

The user's phone cannot run the Tailscale CLI or read the Tailscale app's peer
list, and Hub deliberately does not scan the network. Instead, after the user
has saved one server they trust, the picker's bottom action area offers **Find
servers on my tailnet**, next to **Add server**. That action makes exactly one request — to the saved server —
`GET /api/servers/tailnet` over the same HTTPS origin Hub already uses.

- The request is a normal `/api/*` call, so it is subject to the server's auth
  middleware like every other API route; an unauthenticated request is refused
  rather than answered. Hub sends it with `credentials: "same-origin"` so a
  shell served by the same origin (the web build) carries its session, while
  the native shell's cross-origin request stays CORS-compatible (the server's
  JSON routes advertise `Access-Control-Allow-Origin: *`, which browsers reject
  for credentialed requests).
- The *server* does the discovery: it runs `tailscale status --json` and probes
  each online peer's machine-level listener on TCP port 41641, bound directly
  to the peer's Tailscale IPv4 address. The HTTP request travels inside
  Tailscale's encrypted WireGuard connection, so the listener sees the real
  peer socket address and does not trust proxy headers. Its response includes
  each project's own HTTPS Serve URL and shared server row fields. Older
  RepoOS peers fall back to SSH and `tailscale serve status --json`. Peer
  identity is the peer's MagicDNS name (`bee`,
  `thinkpad`), not Tailscale's display `HostName`: duplicate display names stay
  distinct, and a machine whose display name contains spaces or punctuation is
  reached at its MagicDNS name. The display name is kept as `displayName` for a
  readable label. Android/iOS peers cannot run a RepoOS server, so they are
  skipped rather than reported as failures. No part of this touches the
  phone's network. When the server's Tailscale CLI is absent or unreadable, it
  falls back to the configured `remoteValidation.tailscaleHosts` pool and
  reports `discoverySource: "configured-hosts"`, or `"local-only"` when there is
  no configured pool either, so Hub can name what it actually listed instead of
  claiming the tailnet is invisible.
- The response is the same server rows `repoos servers --tailscale --json`
  reports, plus a ready-to-open `url` and an `https` flag per row. Rows that
  could not be reached carry `unreachable: true` and a `reason` (for example
  `command not found`, an authentication failure, `connection refused`, or
  `timed out` only when a real timeout occurred). A per-host timeout and a
  whole-request deadline mean one slow machine cannot hang the list; Hub renders
  the partial result and says which host failed.
- Discovery can be turned off on the server (`tailnetDiscovery = false` in
  `repoos.toml`, or Settings → General → Tailnet server discovery). The
  endpoint then returns a plain `disabled` message, and manual URL entry keeps
  working exactly as before.
- A server older than the endpoint answers `404` (or not JSON at all). Hub says
  that server is running an older RepoOS that can't list tailnet servers yet,
  offers a button that opens manual add, and never retries or scans instead.
- Results are only a suggestion: Hub marks servers already saved, shows which
  rows have no HTTPS URL (they cannot be saved), and saves only the rows the
  user explicitly selects. Every pick still goes through the existing HTTPS
  reachability gate (`fetch(origin + "/api/health")`) before it reaches
  `@capacitor/preferences`. Nothing is saved automatically, and the server is
  never told which rows were chosen.

There is currently one integration caveat: the native shell's cookies live in
the isolated InAppBrowser container, so it has no session for the saved server
by itself. On a server with authentication enabled the discovery request can
therefore be refused; Hub shows that refusal plainly and leaves manual add
available. Giving the shell its own per-server session is story task **#0304**.
Auth-disabled servers, and the web build served from the same origin, work
today.


### HTTPS-only, reachability-gated add flow

`mobile/src/reachability.ts` enforces, before a server can be saved:

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
