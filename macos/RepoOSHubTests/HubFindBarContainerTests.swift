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
        container.frame = NSRect(x: 0, y: 0, width: 800, height: 600)
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 800, height: 600),
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        window.isReleasedWhenClosed = false
        window.contentView = container
        defer {
            window.orderOut(nil)
            window.contentView = nil
            RunLoop.main.run(until: Date().addingTimeInterval(0.1))
            window.close()
        }

        window.makeKeyAndOrderFront(nil)
        settleFocusWindow(window)
        container.presentFindInterface()
        settleFocusWindow(window)
        XCTAssertTrue(
            container.containsKeyboardFocus(in: window),
            "the find field must hold focus before Done closes the bar"
        )

        container.hideFindInterface()
        let deadline = Date().addingTimeInterval(1)
        while Date() < deadline,
            !container.containsKeyboardFocus(in: window)
                || container.isFindBarVisible
        {
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        }

        XCTAssertFalse(container.isFindBarVisible)
        XCTAssertTrue(
            container.containsKeyboardFocus(in: window),
            "keyboard focus must return to the page after hiding the find bar"
        )
    }

    /// Lets AppKit install key-window focus and `hideFindInterface`'s async
    /// first-responder handoff before assertions run.
    @MainActor
    private func settleFocusWindow(_ window: NSWindow) {
        for _ in 0..<3 {
            window.layoutIfNeeded()
            window.contentView?.layoutSubtreeIfNeeded()
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        }
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
