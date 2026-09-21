# macOS Hub WebKit boundary

The RepoOS Hub loads each selected server's ordinary web UI inside an isolated
`WKWebView`. This document describes session isolation, navigation policy, and
how to verify that loaded server JavaScript cannot reach native capabilities.

See also [ADR 0006](adr/0006-macos-repoos-hub.md) for the full architecture.

## Per-origin session isolation

- Each registry entry (`serverID`) maps to a dedicated
  `WKWebsiteDataStore(forIdentifier:)`.
- Cookies and web storage for server A are never shared with server B, even when
  host names look similar.
- The Hub does not read, export, or copy session cookies to the Keychain.
- **Clear sign-in** removes website data only for that server's store.
- Removing a server from the registry deletes its data store.

Sessions survive app restarts and switching away to another server in the
sidebar; WebKit persists the per-identifier store on disk.

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
