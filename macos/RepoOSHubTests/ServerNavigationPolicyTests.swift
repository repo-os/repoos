import XCTest
@testable import RepoOSHub

final class ServerNavigationPolicyTests: XCTestCase {
    private let origin = URL(string: "https://repo.example.com")!

    func testAllowsSameOriginPaths() {
        let taskURL = URL(string: "https://repo.example.com/tasks/0042")!
        let decision = ServerNavigationPolicy.decide(
            requestURL: taskURL,
            allowedOrigin: origin,
            isMainFrame: true,
            activation: .linkActivated,
            opensNewWindow: false
        )
        XCTAssertEqual(decision, .allowInWebView)
    }

    func testBlocksForeignOriginWithoutUserActivation() {
        let foreign = URL(string: "https://evil.example")!
        let decision = ServerNavigationPolicy.decide(
            requestURL: foreign,
            allowedOrigin: origin,
            isMainFrame: true,
            activation: .other,
            opensNewWindow: false
        )
        XCTAssertEqual(decision, .cancel(reason: .foreignOrigin))
    }

    func testUserActivatedForeignHTTPSOpensInBrowser() {
        let docs = URL(string: "https://docs.repoos.org/guide")!
        let decision = ServerNavigationPolicy.decide(
            requestURL: docs,
            allowedOrigin: origin,
            isMainFrame: true,
            activation: .linkActivated,
            opensNewWindow: false
        )
        XCTAssertEqual(decision, .openInDefaultBrowser(docs))
    }

    func testMailtoOpensInBrowserWhenLinkActivated() {
        let mail = URL(string: "mailto:hello@repoos.org")!
        let decision = ServerNavigationPolicy.decide(
            requestURL: mail,
            allowedOrigin: origin,
            isMainFrame: true,
            activation: .linkActivated,
            opensNewWindow: false
        )
        XCTAssertEqual(decision, .openInDefaultBrowser(mail))
    }

    func testCustomSchemeBlocked() {
        let custom = URL(string: "repoos-hub://invoke")!
        let decision = ServerNavigationPolicy.decide(
            requestURL: custom,
            allowedOrigin: origin,
            isMainFrame: true,
            activation: .linkActivated,
            opensNewWindow: false
        )
        XCTAssertEqual(decision, .cancel(reason: .unsafeScheme))
    }

    func testPopupNavigationBlocked() {
        let same = URL(string: "https://repo.example.com/login")!
        let decision = ServerNavigationPolicy.decide(
            requestURL: same,
            allowedOrigin: origin,
            isMainFrame: true,
            activation: .linkActivated,
            opensNewWindow: true
        )
        XCTAssertEqual(decision, .cancel(reason: .popup))
    }

    func testURLErrorMapping() {
        XCTAssertEqual(
            ServerWebLoadFailure.fromURLError(URLError(.timedOut)),
            .timeout
        )
        XCTAssertEqual(
            ServerWebLoadFailure.fromURLError(URLError(.notConnectedToInternet)),
            .offline
        )
        XCTAssertEqual(
            ServerWebLoadFailure.fromURLError(URLError(.secureConnectionFailed)),
            .tls
        )
    }
}
