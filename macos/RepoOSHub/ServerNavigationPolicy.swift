import Foundation

/// Mirrors `WKNavigationType` for unit tests without linking WebKit in the test bundle logic path.
enum HubNavigationActivation: Equatable {
    case linkActivated
    case formSubmitted
    case backForward
    case reload
    case other
}

enum ServerNavigationAction: Equatable {
    case allowInWebView
    case openInDefaultBrowser(URL)
    case cancel(reason: ServerNavigationBlockReason)
}

enum ServerNavigationBlockReason: Equatable {
    case foreignOrigin
    case unsafeScheme
    case popup
    case download
}

enum ServerNavigationPolicy {
    /// Top-level and subresource requests must stay on the selected server's canonical HTTPS origin.
    static func decide(
        requestURL: URL,
        allowedOrigin: URL,
        isMainFrame: Bool,
        activation: HubNavigationActivation,
        opensNewWindow: Bool
    ) -> ServerNavigationAction {
        if opensNewWindow {
            return .cancel(reason: .popup)
        }

        let scheme = (requestURL.scheme ?? "").lowercased()

        if scheme == "mailto" || scheme == "tel" {
            if activation == .linkActivated {
                return .openInDefaultBrowser(requestURL)
            }
            return .cancel(reason: .unsafeScheme)
        }

        if scheme != "https" {
            if requestURL.absoluteString == "about:blank" {
                return .allowInWebView
            }
            return .cancel(reason: .unsafeScheme)
        }

        if isSameOrigin(requestURL, allowedOrigin) {
            return .allowInWebView
        }

        if activation == .linkActivated || activation == .formSubmitted {
            return .openInDefaultBrowser(requestURL)
        }

        return .cancel(reason: .foreignOrigin)
    }

    static func isSameOrigin(_ url: URL, _ allowedOrigin: URL) -> Bool {
        ServerOriginNormalizer.canonicalOriginKey(for: url)
            == ServerOriginNormalizer.canonicalOriginKey(for: allowedOrigin)
    }
}

enum ServerWebLoadFailure: Equatable {
    case offline
    case tls
    case timeout
    case httpStatus(Int)
    case blockedNavigation(ServerNavigationBlockReason)
    case unknown(String)

    var title: String {
        switch self {
        case .offline: return "Server unreachable"
        case .tls: return "Secure connection failed"
        case .timeout: return "Connection timed out"
        case .httpStatus(let code): return "Server returned HTTP \(code)"
        case .blockedNavigation: return "Navigation blocked"
        case .unknown: return "Could not load page"
        }
    }

    var guidance: String {
        switch self {
        case .offline:
            return "Check your network connection or VPN, then try again."
        case .tls:
            return "The server's TLS certificate could not be verified. Confirm the HTTPS origin is correct."
        case .timeout:
            return "The server did not respond in time."
        case .httpStatus:
            return "RepoOS returned an unexpected response. The server may be restarting."
        case .blockedNavigation(let reason):
            switch reason {
            case .foreignOrigin:
                return "RepoOS Hub only loads pages from the selected server's origin."
            case .unsafeScheme:
                return "That link uses a scheme that cannot run inside the Hub web view."
            case .popup:
                return "Pop-up windows are blocked. Use in-app navigation or open the link in your browser."
            case .download:
                return "Downloads are not saved automatically. Use your browser if you need a file."
            }
        case .unknown(let detail):
            return detail
        }
    }

    static func fromURLError(_ error: URLError) -> ServerWebLoadFailure {
        switch error.code {
        case .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed:
            return .offline
        case .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate,
             .serverCertificateNotYetValid, .clientCertificateRejected:
            return .tls
        case .timedOut:
            return .timeout
        default:
            return .unknown(error.localizedDescription)
        }
    }
}
