import AppKit
import WebKit
import XCTest
@testable import RepoOSHub

/// Regression tests for #0795: the Hub owns its find bar. It is find-only (no
/// Replace), floats over the top-right of the page, and hides on Done/Escape.
final class HubFindBarContainerTests: XCTestCase {
    @MainActor
    private func makeContainer() -> HubServerWebContainerView {
        let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        return HubServerWebContainerView(webView: webView)
    }

    @MainActor
    func testFindBarStartsHidden() {
        let container = makeContainer()

        XCTAssertFalse(container.isFindBarVisible)
    }

    @MainActor
    func testPresentingFindBarShowsIt() {
        let container = makeContainer()

        container.presentFindInterface()

        XCTAssertTrue(container.isFindBarVisible)
    }

    @MainActor
    func testHideFindInterfaceHidesTheBar() {
        let container = makeContainer()
        container.presentFindInterface()

        container.hideFindInterface()

        XCTAssertFalse(container.isFindBarVisible)
    }

    @MainActor
    func testFindBarFloatsInTheTopRight() {
        let container = makeContainer()
        container.frame = NSRect(x: 0, y: 0, width: 800, height: 600)

        container.presentFindInterface()

        // Non-flipped AppKit coordinates: a top-right origin has a large x and a
        // large y, with the whole frame inside the container.
        let bar = container.findBar.frame
        XCTAssertGreaterThanOrEqual(bar.maxX, container.bounds.maxX - 20)
        XCTAssertGreaterThan(bar.minX, container.bounds.midX)
        XCTAssertGreaterThanOrEqual(bar.minY, container.bounds.midY)
        XCTAssertLessThanOrEqual(bar.maxY, container.bounds.maxY)
        XCTAssertTrue(container.findBar.isDescendant(of: container))
    }

    @MainActor
    func testFindBarHasDoneAndNoReplaceControl() {
        let container = makeContainer()
        container.presentFindInterface()

        let labels = Self.buttonLabels(in: container.findBar)
        XCTAssertFalse(
            labels.contains { $0.localizedCaseInsensitiveContains("replace") },
            "the Hub find bar is find-only; found labels: \(labels)"
        )
        XCTAssertTrue(labels.contains("Done"), "expected a Done control; found: \(labels)")
    }

    @MainActor
    func testCancelOperationHidesTheBar() {
        let container = makeContainer()
        container.presentFindInterface()

        // Escape is routed to `cancelOperation` on the responder chain as a
        // backstop when the field editor does not consume it.
        container.cancelOperation(nil)

        XCTAssertFalse(container.isFindBarVisible)
    }

    @MainActor
    func testHidingFindBarReturnsFocusToThePage() {
        let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        let container = HubServerWebContainerView(webView: webView)
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 800, height: 600),
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        window.contentView = container
        window.makeKeyAndOrderFront(nil)
        container.presentFindInterface()

        container.hideFindInterface()
        // Focus moves back on the next run loop.
        RunLoop.current.run(until: Date().addingTimeInterval(0.25))

        XCTAssertTrue(window.firstResponder === container.webView)
        window.close()
    }

    @MainActor
    func testContainsKeyboardFocusIsFalseWithoutAWindow() {
        let container = makeContainer()

        XCTAssertFalse(container.containsKeyboardFocus(in: nil))
    }

    @MainActor
    private static func buttonLabels(in view: NSView) -> [String] {
        var labels: [String] = []
        if let button = view as? NSButton {
            labels.append(button.title)
            labels.append(button.toolTip ?? "")
            labels.append(button.accessibilityLabel() ?? "")
        }
        for subview in view.subviews {
            labels.append(contentsOf: buttonLabels(in: subview))
        }
        return labels
    }
}
