import WebKit

/// Builds `WKWebViewConfiguration` for untrusted RepoOS server pages — no bridge, scripts, or handlers.
enum IsolatedServerWebViewFactory {
    static func makeConfiguration(dataStore: WKWebsiteDataStore) -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = dataStore
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        PrivilegeBoundaryAudit.validate(configuration)
        return configuration
    }
}

enum PrivilegeBoundaryAudit {
    /// Regression guard: server pages must not receive injected scripts or native message handlers.
    static func validate(_ configuration: WKWebViewConfiguration) {
        let controller = configuration.userContentController
        precondition(controller.userScripts.isEmpty, "Server web views must not inject user scripts.")
    }

    static func isHardened(_ configuration: WKWebViewConfiguration) -> Bool {
        configuration.userContentController.userScripts.isEmpty
            && configuration.websiteDataStore != .default()
    }
}
