import AppKit
import WebKit
import XCTest
@testable import RepoOSHub

/// Regression tests for #0789: Cmd-F showed a black strip because the
/// NSTextFinder bar was never installed in the view hierarchy, so it had no
/// window and could not take focus.
final class HubFindBarContainerTests: XCTestCase {
    @MainActor
    private func makeContainer() -> HubServerWebContainerView {
        let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        return HubServerWebContainerView(webView: webView)
    }

    @MainActor
    func testAssigningFindBarViewInstallsItAsSubview() {
        let container = makeContainer()
        let bar = NSView(frame: NSRect(x: 0, y: 0, width: 800, height: 30))

        container.findBarView = bar

        XCTAssertTrue(bar.isDescendant(of: container))
    }

    @MainActor
    func testReplacingFindBarViewRemovesTheOldBar() {
        let container = makeContainer()
        let first = NSView(frame: NSRect(x: 0, y: 0, width: 800, height: 30))
        let second = NSView(frame: NSRect(x: 0, y: 0, width: 800, height: 30))

        container.findBarView = first
        container.findBarView = second

        XCTAssertFalse(first.isDescendant(of: container))
        XCTAssertTrue(second.isDescendant(of: container))
    }

    @MainActor
    func testContainsKeyboardFocusIsFalseWithoutAWindow() {
        let container = makeContainer()

        XCTAssertFalse(container.containsKeyboardFocus(in: nil))
    }
}
