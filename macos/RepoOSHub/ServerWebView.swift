import AppKit
import SwiftUI
import WebKit

@MainActor
final class ServerWebViewModel: ObservableObject {
    @Published var loadFailure: ServerWebLoadFailure?
    @Published var pendingExternalURL: URL?
    @Published var showOAuthGuidance = false
    @Published var isLoading = false

    let serverID: UUID
    let origin: URL

    init(serverID: UUID, origin: URL) {
        self.serverID = serverID
        self.origin = origin
    }

    func reload() {
        loadFailure = nil
        NotificationCenter.default.post(name: .serverWebViewReload, object: serverID)
    }

    func openPendingExternalURL() {
        guard let url = pendingExternalURL else { return }
        NSWorkspace.shared.open(url)
        pendingExternalURL = nil
        showOAuthGuidance = false
    }

    func dismissExternalPrompt() {
        pendingExternalURL = nil
        showOAuthGuidance = false
    }
}

extension Notification.Name {
    static let serverWebViewReload = Notification.Name("org.repoos.hub.serverWebViewReload")
}

struct ServerWebView: NSViewRepresentable {
    @ObservedObject var model: ServerWebViewModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeNSView(context: Context) -> WKWebView {
        let dataStore = ServerWebsiteDataStorePool.shared.dataStore(for: model.serverID)
        let configuration = IsolatedServerWebViewFactory.makeConfiguration(dataStore: dataStore)
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        context.coordinator.webView = webView
        context.coordinator.loadHomeIfNeeded()
        context.coordinator.observeReload()
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.model = model
        if context.coordinator.loadedOriginKey
            != ServerOriginNormalizer.canonicalOriginKey(for: model.origin)
        {
            context.coordinator.loadedOriginKey = ServerOriginNormalizer.canonicalOriginKey(for: model.origin)
            context.coordinator.loadHomeIfNeeded()
        }
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var model: ServerWebViewModel
        weak var webView: WKWebView?
        var loadedOriginKey: String?
        private var reloadObserver: NSObjectProtocol?

        init(model: ServerWebViewModel) {
            self.model = model
        }

        deinit {
            if let reloadObserver {
                NotificationCenter.default.removeObserver(reloadObserver)
            }
        }

        func observeReload() {
            reloadObserver = NotificationCenter.default.addObserver(
                forName: .serverWebViewReload,
                object: model.serverID,
                queue: .main
            ) { [weak self] _ in
                self?.loadHomeIfNeeded()
            }
        }

        func loadHomeIfNeeded() {
            guard let webView else { return }
            model.isLoading = true
            model.loadFailure = nil
            let request = URLRequest(url: model.origin, cachePolicy: .useProtocolCachePolicy)
            webView.load(request)
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = navigationAction.request.url else {
                return .cancel
            }

            let activation = HubNavigationActivation(wkType: navigationAction.navigationType)
            let opensNewWindow = navigationAction.targetFrame == nil
            let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true

            let decision = ServerNavigationPolicy.decide(
                requestURL: url,
                allowedOrigin: model.origin,
                isMainFrame: isMainFrame,
                activation: activation,
                opensNewWindow: opensNewWindow
            )

            switch decision {
            case .allowInWebView:
                return .allow
            case .openInDefaultBrowser(let external):
                model.pendingExternalURL = external
                model.showOAuthGuidance = true
                return .cancel
            case .cancel(let reason):
                if isMainFrame, activation == .linkActivated || activation == .formSubmitted {
                    model.loadFailure = .blockedNavigation(reason)
                }
                return .cancel
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse) async -> WKNavigationResponsePolicy {
            if navigationResponse.canShowMIMEType == false {
                model.loadFailure = .blockedNavigation(.download)
                return .cancel
            }
            if let http = navigationResponse.response as? HTTPURLResponse,
               http.statusCode >= 400,
               navigationResponse.isForMainFrame
            {
                model.loadFailure = .httpStatus(http.statusCode)
                return .allow
            }
            return .allow
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            model.isLoading = false
            model.loadFailure = nil
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            model.isLoading = false
            model.loadFailure = mapError(error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            model.isLoading = false
            model.loadFailure = mapError(error)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            nil
        }

        private func mapError(_ error: Error) -> ServerWebLoadFailure {
            if let urlError = error as? URLError {
                return ServerWebLoadFailure.fromURLError(urlError)
            }
            return .unknown(error.localizedDescription)
        }
    }
}

private extension HubNavigationActivation {
    init(wkType: WKNavigationType) {
        switch wkType {
        case .linkActivated: self = .linkActivated
        case .formSubmitted: self = .formSubmitted
        case .backForward: self = .backForward
        case .reload: self = .reload
        default: self = .other
        }
    }
}
