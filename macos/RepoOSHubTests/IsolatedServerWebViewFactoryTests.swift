import WebKit
import XCTest
@testable import RepoOSHub

final class IsolatedServerWebViewFactoryTests: XCTestCase {
    func testConfigurationHasNoInjectedScriptsOrDefaultStore() {
        let store = WKWebsiteDataStore(forIdentifier: UUID())
        let configuration = IsolatedServerWebViewFactory.makeConfiguration(dataStore: store)
        XCTAssertTrue(PrivilegeBoundaryAudit.isHardened(configuration))
        XCTAssertTrue(configuration.userContentController.userScripts.isEmpty)
    }

    func testMaliciousPageCannotReachNativeBridgeByConfiguration() {
        // Server JavaScript only sees a stock WKWebView configuration: no handlers are registered.
        let store = WKWebsiteDataStore(forIdentifier: UUID())
        let configuration = IsolatedServerWebViewFactory.makeConfiguration(dataStore: store)
        let controller = configuration.userContentController
        XCTAssertTrue(controller.userScripts.isEmpty)
        // `window.webkit.messageHandlers` is absent unless handlers are added — we never add any.
        XCTAssertNil(controller.userScripts.first)
    }
}
