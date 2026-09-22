# macOS Hub WebKit boundary

The RepoOS Hub loads each selected server's ordinary web UI inside an isolated
`WKWebView`. This document describes session isolation, navigation policy, and
how to verify that loaded server JavaScript cannot reach native capabilities.

See also [ADR 0006](adr/0006-macos-repoos-hub.md) for the full architecture.

## Shipped scope

The Hub is an ordinary web browser window bound to each saved server, wrapped
in native chrome: the server sidebar (add / edit / pin / remove, health and
offline states), per-origin sign-in that persists across launches, the Cmd-K
command palette with cross-server task search, attention summaries with
notifications and a Dock badge, and task pins. The Hub renders each server's
real web UI and adds **no write access of its own**; the native additions are
read-only conveniences on top of the server's own endpoints.

The authenticated parts of that — attention counts, notifications, cross-server
search — sit behind the capability gate that ADR 0006's v1 milestone held for
its "v2 gate": a server-issued, scoped, expiry-bound, revocable Hub capability
([native-hub-capabilities.md](native-hub-capabilities.md)). Nothing native
polls authenticated APIs, infers status from rendered HTML, or sends
credentials to a server unless that server issued such a capability.

Still deliberately **not** shipped:

- **Background operation.** Attention is polled only while the app is running.
  There is no push channel or scheduled fetch that fires after the Hub is quit.
- **Cookie sharing** — with Safari or between servers. Each server session
  lives in its own WebKit store; enterprise SSO that requires the system
  browser is opened there, and that sign-in is not shared back into the Hub's
  web view.
- **Offline mode.** The Hub needs its servers reachable; what it caches locally
  is limited to registry entries, pins, and capabilities.
- **Automatic remote pairing.** Remote capabilities are created on the server
  and pasted into the Hub once (see the capabilities doc); there is no token
  exchange handshake yet.

Keep this list honest: when an item ships, remove it here and in the
user-facing guide (`user-docs/macos-hub.md`) in the same change.

## Per-origin session isolation

- Each registry entry (`serverID`) maps to a dedicated
  `WKWebsiteDataStore(forIdentifier:)`.
- Cookies and web storage for server A are never shared with server B, even when
  host names look similar.
- The Hub does not read, export, or copy session cookies to the Keychain.
- **Clear sign-in** removes website data only for that server's store.
- Removing a server from the registry deletes its data store.

Sessions survive switching away to another server in the sidebar. Persistence
across app relaunches depends on the OS: on macOS 14+ the pool uses
identifier-backed stores (`WKWebsiteDataStore(forIdentifier:)`) that WebKit
persists on disk, so sign-in survives relaunch; on macOS 13 the pool falls back
to one distinct in-memory store per server (isolation and switching still hold,
but sign-in is dropped when the app quits).

## Privilege boundary

Server pages receive a stock `WKWebViewConfiguration`:

- No `WKUserContentController` message handlers.
- No injected user scripts or privileged JavaScript bridges.
- No custom URL schemes handled by native code.
- Registry and navigation state live in SwiftUI outside the web view.

`IsolatedServerWebViewFactory` and `PrivilegeBoundaryAudit` enforce the
no-injection invariant at construction time; unit tests assert it on every build.

## Navigation policy

`ServerNavigationPolicy` (pure Swift, unit-tested) governs each navigation:

| Request | Main frame | User activated | Result |
| --- | --- | --- | --- |
| Same HTTPS origin as saved server (or a saved loopback HTTP development origin) | any | any | Allow in web view |
| `mailto:` / `tel:` | yes | link | Open in default browser |
| Other HTTPS origin | yes | link or form | Open in default browser (OAuth/docs) |
| Other HTTPS origin | yes | not user | Cancel |
| Non-HTTPS scheme (except `about:blank` and the exact saved loopback HTTP origin) | any | any | Cancel |
| Pop-up (`targetFrame == nil`) | any | any | Cancel |
| Download (non-displayable MIME) | any | any | Cancel with guidance |

External navigations never replace the embedded RepoOS view without explicit
confirmation. The sheet explains that enterprise SSO may require the system
browser and that cookies are not shared between Safari and the Hub web view.

## Failure recovery

Load and health-check failures keep the native sidebar visible. The content area
shows the canonical origin, a reason class (offline, TLS, timeout, HTTP status,
blocked navigation), and **Retry**, **Edit server…**, **Clear sign-in**, and
**Remove server** actions.

## Automated tests

`macos/RepoOSHubTests/ServerNavigationPolicyTests.swift` covers origin matching,
external links, pop-ups, and error mapping.

`macos/RepoOSHubTests/IsolatedServerWebViewFactoryTests.swift` asserts that web
view configurations ship with empty user scripts and a non-default data store.

## Manual verification (privilege regression)

On a development build with a local RepoOS server (HTTPS, or loopback HTTP such as `http://localhost:7171`):

1. Add the server and sign in through the embedded web UI.
2. Switch to a second server, sign in with a different account, then switch back
   — the first server's session should still be active.
3. In the web UI developer tools (or a test page served from the same origin),
   confirm `window.webkit.messageHandlers` is undefined.
4. Attempt `window.webkit.messageHandlers.repoos.postMessage('x')` in the
   console — it must throw; no native UI should react.
5. Click an external HTTPS link — the Hub should offer **Open in browser** instead
   of navigating in-place.
6. Use **Clear sign-in** — the server should require login again; other servers
   stay signed in.

CI runs `xcodebuild test` for the Swift unit suite on macOS when `macos/**`
changes.

## User-visible terminology

Internal names in the Swift code and in these docs differ from the terms the
app and the user guide use. Keep the two aligned in both directions:

| Internal (code / these docs) | User-visible (app / `user-docs/macos-hub.md`) |
| --- | --- |
| registry entry (`ServerRegistryEntry`) | a server in the **Servers** list |
| attention summary (`/api/hub/v1/summary`) | the counts in the sidebar badge / details popover |
| Hub capability (bearer token, `roh_…`) | **capability token**, entered under **Advanced remote pairing** |
| command palette | the **Cmd-K** quick switcher |
| pinned task | a **pin** |
| per-origin web session | that server's sign-in |

When you add a user-facing feature, ship the app string (with a test) *and* a
line in `user-docs/macos-hub.md`; when you rename one, update both in the same
change so the docs never describe a control by a name the app doesn't use.
