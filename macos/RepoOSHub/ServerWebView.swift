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
        NotificationCenter.default.post(
            name: .hubWebNavigationReload,
            object: nil,
            userInfo: HubWebNavigationCommand.userInfo(serverID: serverID)
        )
    }

    /// Use a fresh origin navigation after a server has just started. Reloading
    /// WebKit's prior provisional failure can leave it displaying a blank page.
    func loadRootPage() {
        loadFailure = nil
        NotificationCenter.default.post(
            name: .serverWebViewReload,
            object: nil,
            userInfo: HubWebNavigationCommand.userInfo(serverID: serverID)
        )
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
    static let hubWebReadAccentColor = Notification.Name("org.repoos.hub.webReadAccentColor")
}

struct ServerWebView: NSViewRepresentable {
    @ObservedObject var model: ServerWebViewModel
    @ObservedObject var appState: HubAppState

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model, appState: appState)
    }

    func makeNSView(context: Context) -> HubServerWebContainerView {
        let dataStore = ServerWebsiteDataStorePool.shared.dataStore(for: model.serverID)
        let configuration = IsolatedServerWebViewFactory.makeConfiguration(dataStore: dataStore)
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.underPageBackgroundColor = .black
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        let container = HubServerWebContainerView(webView: webView)
        context.coordinator.webView = webView
        context.coordinator.webContainer = container
        context.coordinator.bindFindFocusTracking()
        context.coordinator.loadInitialPage()
        context.coordinator.observeHubCommands()
        context.coordinator.observeAccentColorCookieStore(dataStore.httpCookieStore)
        // The Hub shell theme must never reach server content: pin the web
        // view to the system appearance (not the Hub override) so a page
        // honouring prefers-color-scheme follows the system, and the
        // server's own web theme setting stays authoritative. No theme is
        // injected, forced, or bridged into the web view.
        context.coordinator.pinWebViewToSystemAppearance()
        context.coordinator.observeSystemAppearance()
        return container
    }

    func updateNSView(_ container: HubServerWebContainerView, context: Context) {
        context.coordinator.model = model
        context.coordinator.appState = appState
        if context.coordinator.loadedOriginKey
            != ServerOriginNormalizer.canonicalOriginKey(for: model.origin)
        {
            context.coordinator.loadedOriginKey = ServerOriginNormalizer.canonicalOriginKey(for: model.origin)
            context.coordinator.loadInitialPage()
        }
        // `updateNSView` runs during SwiftUI rendering. The coordinator defers
        // its observable-state update so a WebKit navigation change cannot
        // recursively trigger another view update.
        context.coordinator.syncNavigationState()
    }

    static func dismantleNSView(_ nsView: HubServerWebContainerView, coordinator: Coordinator) {
        coordinator.stopObservingAccentColor()
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKHTTPCookieStoreObserver {
        var model: ServerWebViewModel
        var appState: HubAppState
        weak var webView: WKWebView?
        weak var webContainer: HubServerWebContainerView?
        var loadedOriginKey: String?
        private var commandObservers: [NSObjectProtocol] = []
        private var systemAppearanceObserver: NSObjectProtocol?
        private var accentColorCookieStore: WKHTTPCookieStore?
        private var accentColorTimer: Timer?

        init(model: ServerWebViewModel, appState: HubAppState) {
            self.model = model
            self.appState = appState
        }

        deinit {
            for observer in commandObservers {
                NotificationCenter.default.removeObserver(observer)
            }
            if let systemAppearanceObserver {
                DistributedNotificationCenter.default().removeObserver(systemAppearanceObserver)
            }
            accentColorTimer?.invalidate()
            accentColorCookieStore?.remove(self)
        }

        func bindFindFocusTracking() {
            webContainer?.onKeyboardFocusChanged = { [weak self] focused in
                guard let self, self.appState.selectedServerID == self.model.serverID else { return }
                self.appState.setWorkspaceWebContentHasKeyboardFocus(focused)
            }
        }

        func observeHubCommands() {
            let serverID = model.serverID
            commandObservers.append(
                NotificationCenter.default.addObserver(
                    forName: .hubWebReadAccentColor,
                    object: nil,
                    queue: .main
                ) { [weak self] note in
                    guard HubWebNavigationCommand.targets(note, serverID: serverID) else { return }
                    Task { @MainActor in
                        self?.readRepositoryAccentColor()
                    }
                }
            )
            commandObservers.append(
                NotificationCenter.default.addObserver(
                    forName: .serverWebViewReload,
                    object: nil,
                    queue: .main
                ) { [weak self] note in
                    guard HubWebNavigationCommand.targets(note, serverID: serverID) else { return }
                    self?.loadInitialPage()
                }
            )
            commandObservers.append(
                NotificationCenter.default.addObserver(
                    forName: .hubWebNavigationReload,
                    object: nil,
                    queue: .main
                ) { [weak self] note in
                    guard HubWebNavigationCommand.targets(note, serverID: serverID) else { return }
                    self?.webView?.reload()
                }
            )
            commandObservers.append(
                NotificationCenter.default.addObserver(
                    forName: .hubWebNavigationBack,
                    object: nil,
                    queue: .main
                ) { [weak self] note in
                    guard HubWebNavigationCommand.targets(note, serverID: serverID) else { return }
                    self?.webView?.goBack()
                }
            )
            commandObservers.append(
                NotificationCenter.default.addObserver(
                    forName: .hubWebNavigationForward,
                    object: nil,
                    queue: .main
                ) { [weak self] note in
                    guard HubWebNavigationCommand.targets(note, serverID: serverID) else { return }
                    self?.webView?.goForward()
                }
            )
            commandObservers.append(
                NotificationCenter.default.addObserver(
                    forName: .hubWebNavigationNavigate,
                    object: nil,
                    queue: .main
                ) { [weak self] note in
                    guard let self,
                          HubWebNavigationCommand.targets(note, serverID: serverID),
                          let path = note.userInfo?[HubWebNavigationCommand.pathKey] as? String
                    else { return }
                    self.load(path: path)
                }
            )
            commandObservers.append(
                NotificationCenter.default.addObserver(
                    forName: .hubWebFindPresent,
                    object: nil,
                    queue: .main
                ) { [weak self] note in
                    guard let self,
                          HubWebNavigationCommand.targets(note, serverID: serverID),
                          self.appState.selectedServerID == serverID,
                          self.webContainer?.containsKeyboardFocus(in: self.webView?.window) == true
                    else { return }
                    self.webContainer?.presentFindInterface()
                }
            )
            commandObservers.append(
                NotificationCenter.default.addObserver(
                    forName: .hubWebFindNext,
                    object: nil,
                    queue: .main
                ) { [weak self] note in
                    guard let self,
                          HubWebNavigationCommand.targets(note, serverID: serverID),
                          self.appState.selectedServerID == serverID
                    else { return }
                    self.webContainer?.findNext()
                }
            )
            commandObservers.append(
                NotificationCenter.default.addObserver(
                    forName: .hubWebFindPrevious,
                    object: nil,
                    queue: .main
                ) { [weak self] note in
                    guard let self,
                          HubWebNavigationCommand.targets(note, serverID: serverID),
                          self.appState.selectedServerID == serverID
                    else { return }
                    self.webContainer?.findPrevious()
                }
            )
        }

        func loadInitialPage() {
            if let pending = appState.consumePendingNavigationRequest(for: model.serverID) {
                load(path: pending.path)
            } else {
                load(path: "/")
            }
        }

        /// Pins this web view to the system appearance. SwiftUI's
        /// preferredColorScheme only styles the native shell, but the web
        /// view lives in that hierarchy — without this pin a forced Hub
        /// scheme would leak into the page via NSAppearance. The pin reads
        /// the system setting directly (never `NSApp.effectiveAppearance`),
        /// so it cannot resolve to the Hub override.
        func pinWebViewToSystemAppearance() {
            webView?.appearance = HubSystemAppearance.appearance
            webContainer?.pinFindBarToSystemAppearance()
        }

        func observeSystemAppearance() {
            guard systemAppearanceObserver == nil else { return }
            systemAppearanceObserver = DistributedNotificationCenter.default().addObserver(
                forName: HubSystemAppearance.themeChangedNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    self?.pinWebViewToSystemAppearance()
                }
            }
        }

        func load(path: String) {
            guard let webView else { return }
            model.isLoading = true
            model.loadFailure = nil
            let normalized = HubRecentsRetention.normalizeRoutePath(path)
            let target: URL
            if normalized == "/" || normalized.isEmpty {
                target = model.origin
            } else if let resolved = URL(string: normalized, relativeTo: model.origin)?.absoluteURL {
                target = resolved
            } else {
                target = model.origin
            }
            webView.load(URLRequest(url: target, cachePolicy: .useProtocolCachePolicy))
        }

        func syncNavigationState() {
            guard appState.selectedServerID == model.serverID else { return }
            let snapshot = navigationSnapshot()
            guard appState.workspaceNavigation != snapshot else { return }

            // This method is also called by `updateNSView`; publishing there
            // synchronously causes SwiftUI's “Publishing changes from within
            // view updates” feedback loop.
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                guard self.appState.selectedServerID == self.model.serverID else { return }
                let latestSnapshot = self.navigationSnapshot()
                guard self.appState.workspaceNavigation != latestSnapshot else { return }
                self.appState.updateWorkspaceNavigation(latestSnapshot)
            }
        }

        private func navigationSnapshot() -> WorkspaceNavigationSnapshot {
            guard let webView else { return .placeholder }
            return WorkspaceNavigationSnapshot(
                hasEmbeddedWebContent: true,
                webCanGoBack: webView.canGoBack,
                webCanGoForward: webView.canGoForward,
                webIsLoading: model.isLoading
            )
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
            if let url = webView.url,
               ServerOriginNormalizer.hasSameOrigin(url, model.origin)
            {
                let path = url.path.isEmpty ? "/" : url.path
                appState.recordRouteVisit(serverID: model.serverID, path: path, title: webView.title)
            }
            readRepositoryAccentColor()
            syncNavigationState()
        }

        /// Repo color is a visual preference the web UI mirrors into the
        /// `repoos_repo_color` first-party cookie (src/ui-app/src/repo-color.ts).
        /// Read only that named cookie from this server's isolated store —
        /// never the session cookie — and observe it so a swatch picked in the
        /// embedded page updates the sidebar bar immediately. No script or
        /// message bridge is exposed to server content.
        func observeAccentColorCookieStore(_ cookieStore: WKHTTPCookieStore) {
            if let accentColorCookieStore {
                accentColorCookieStore.remove(self)
            }
            accentColorCookieStore = cookieStore
            cookieStore.add(self)
            readRepositoryAccentColor()

            // Cookie observation is the immediate path; this low-frequency
            // poll covers a WebKit build that does not notify for a
            // page-script cookie change. It reads the cookie store only for
            // the active server, never page content.
            accentColorTimer?.invalidate()
            accentColorTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    guard let self, self.appState.selectedServerID == self.model.serverID else { return }
                    self.readRepositoryAccentColor()
                }
            }
        }

        /// Release the cookie-store observer when SwiftUI tears this web view
        /// down, so the coordinator and its timer do not outlive the page.
        func stopObservingAccentColor() {
            accentColorTimer?.invalidate()
            accentColorTimer = nil
            accentColorCookieStore?.remove(self)
            accentColorCookieStore = nil
        }

        func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
            guard cookieStore === accentColorCookieStore else { return }
            readRepositoryAccentColor()
        }

        private func readRepositoryAccentColor() {
            guard let cookieStore = accentColorCookieStore,
                  let host = model.origin.host,
                  !host.isEmpty
            else { return }
            let serverID = model.serverID
            cookieStore.getAllCookies { [weak self] cookies in
                let rawValue = cookies.first {
                    $0.name == RepoAccentColorPreference.cookieName
                        && RepoAccentColorPreference.cookieMatches(domain: $0.domain, host: host)
                }?.value
                Task { @MainActor in
                    guard let self, let rawValue else { return }
                    let repoName = self.appState.entries
                        .first { $0.id == serverID }?
                        .repositoryName
                    switch RepoAccentColorPreference.parseCookieValue(
                        rawValue,
                        expectedRepoName: repoName
                    ) {
                    case .color(let hex):
                        self.appState.updateWorkspaceAccentColor(hex, for: serverID)
                    case .cleared:
                        self.appState.updateWorkspaceAccentColor(nil, for: serverID)
                    case .unsupported:
                        break
                    }
                }
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            model.isLoading = false
            if !isCancellation(error) { model.loadFailure = mapError(error) }
            syncNavigationState()
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            model.isLoading = false
            if !isCancellation(error) { model.loadFailure = mapError(error) }
            syncNavigationState()
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            nil
        }

        func webView(
            _ webView: WKWebView,
            runOpenPanelWith parameters: WKOpenPanelParameters,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping ([URL]?) -> Void
        ) {
            let panel = NSOpenPanel()
            panel.canChooseFiles = true
            panel.canChooseDirectories = parameters.allowsDirectories
            panel.allowsMultipleSelection = parameters.allowsMultipleSelection
            panel.prompt = "Choose"

            let finish: (NSApplication.ModalResponse) -> Void = { response in
                completionHandler(response == .OK ? panel.urls : nil)
            }
            if let window = webView.window {
                panel.beginSheetModal(for: window, completionHandler: finish)
            } else {
                panel.begin(completionHandler: finish)
            }
        }

        private func isCancellation(_ error: Error) -> Bool {
            (error as? URLError)?.code == .cancelled
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
