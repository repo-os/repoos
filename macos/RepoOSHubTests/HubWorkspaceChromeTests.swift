import AppKit
import SwiftUI
import XCTest

@testable import RepoOSHub

/// Regression coverage for #0895: in Tabs mode the page must start below the
/// tab strip (not under it), and the native toolbar row — which SwiftUI
/// installs after the scene's chrome configuration — must stay hidden with its
/// automatic sidebar toggle removed.
final class HubWorkspaceChromeTests: XCTestCase {
    func testTabStripOwnsTheTopBandOnlyInTabsMode() {
        XCTAssertTrue(HubWorkspaceLayout.usesTabStrip(.tabs))
        XCTAssertFalse(HubWorkspaceLayout.usesTabStrip(.sidebar))

        XCTAssertEqual(HubWorkspaceLayout.contentTopInset(.tabs), HubServerTabStripMetrics.height)
        XCTAssertEqual(HubWorkspaceLayout.contentTopInset(.sidebar), 0)

        // The page may only reclaim the titlebar band when no strip is there.
        XCTAssertFalse(HubWorkspaceLayout.pageExtendsUnderTitleBar(.tabs))
        XCTAssertTrue(HubWorkspaceLayout.pageExtendsUnderTitleBar(.sidebar))
    }

    @MainActor
    func testTabsModePageStartsBelowTheStripInARealWindow() throws {
        let state = try makeAppState()
        let window = hostWindow(layout: .tabs, state: state)
        defer { window.close() }
        settle(window)

        let pageTop = try marker(from: window, named: "page").topFromWindow
        XCTAssertEqual(
            pageTop,
            HubServerTabStripMetrics.height,
            accuracy: 1,
            "the page's top edge must sit at the tab strip's bottom edge"
        )
        XCTAssertFalse(
            window.toolbar?.isVisible ?? false,
            "SwiftUI's native toolbar row must be hidden once the view has laid out"
        )
        // Not merely absent: SwiftUI installs this toolbar with the split view,
        // and the chrome view is what hides it and removes its toggle.
        XCTAssertNotNil(window.toolbar)
        XCTAssertFalse(
            window.toolbar?.items.contains {
                $0.itemIdentifier.rawValue
                    == HubNativeToolbar.swiftUISidebarToggleItemIdentifier
            } ?? false,
            "the system sidebar toggle must not duplicate the Hub's own control"
        )
    }

    @MainActor
    func testSidebarModePageReclaimsTheWindowTop() throws {
        let state = try makeAppState()
        let window = hostWindow(layout: .sidebar, state: state)
        defer { window.close() }
        settle(window)

        let pageTop = try marker(from: window, named: "page").topFromWindow
        XCTAssertEqual(pageTop, 0, accuracy: 1, "sidebar mode keeps the reclaimed titlebar band")
    }

    @MainActor
    func testLateToolbarRowIsHiddenAndLosesItsSidebarToggle() throws {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 600),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.isReleasedWhenClosed = false
        defer { window.close() }

        let chrome = HubWindowChromeView(appearance: .light)
        window.contentView = chrome
        configureHubWorkspaceWindowChrome(window)

        // Simulate SwiftUI installing its NavigationSplitView toolbar after the
        // scene attached, which is what happened in a real Hub window.
        let toggle = NSToolbarItem(
            itemIdentifier: NSToolbarItem.Identifier(
                HubNativeToolbar.swiftUISidebarToggleItemIdentifier
            )
        )
        let delegate = StubToolbarDelegate(toggle: toggle)
        let toolbar = NSToolbar(identifier: "HubLateSwiftUIToolbar")
        toolbar.delegate = delegate
        window.toolbar = toolbar
        toolbar.isVisible = true
        XCTAssertEqual(toolbar.items.map(\.itemIdentifier), [toggle.itemIdentifier])

        chrome.layout()

        XCTAssertFalse(toolbar.isVisible, "the native toolbar row must stay hidden")
        XCTAssertTrue(
            toolbar.items.isEmpty,
            "SwiftUI's automatic sidebar toggle must not duplicate the Hub's own"
        )

        // Re-installing it (as SwiftUI may on a toolbar refresh) is re-hidden.
        toolbar.insertItem(withItemIdentifier: toggle.itemIdentifier, at: 0)
        XCTAssertEqual(toolbar.items.count, 1)
        chrome.layout()
        XCTAssertFalse(toolbar.isVisible)
        XCTAssertTrue(toolbar.items.isEmpty)
    }

    // MARK: - Fixtures

    @MainActor
    private func makeAppState() throws -> HubAppState {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("hub-chrome-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return HubAppState(
            store: ServerRegistryStore(directoryURL: directory),
            healthChecker: StubHealthChecker(),
            attentionCoordinator: HubAttentionCoordinator()
        )
    }

    @MainActor
    private func hostWindow(
        layout: HubServerNavigationLayout,
        state: HubAppState
    ) -> NSWindow {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 640),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.isReleasedWhenClosed = false
        configureHubWorkspaceWindowChrome(window)

        // Mirror the app's real composition: the chrome container lives in the
        // detail column of a NavigationSplitView, which is what installs the
        // late native toolbar, and the chrome view itself hides that toolbar.
        let root = NavigationSplitView(
            columnVisibility: .constant(layout == .tabs ? .detailOnly : .all)
        ) {
            Color.gray
        } detail: {
            HubWorkspaceChrome(layout: layout) {
                ProbePage(layout: layout)
            }
        }
        .environmentObject(state)
        .background(WindowChromeHost())

        window.contentView = NSHostingView(rootView: root)
        window.setContentSize(NSSize(width: 900, height: 640))
        return window
    }

    @MainActor
    private func settle(_ window: NSWindow) {
        for _ in 0..<3 {
            window.layoutIfNeeded()
            window.contentView?.layoutSubtreeIfNeeded()
            RunLoop.main.run(until: Date().addingTimeInterval(0.2))
        }
    }

    @MainActor
    private func marker(from window: NSWindow, named name: String) throws -> MarkerFrame {
        guard let contentView = window.contentView else {
            throw MarkerError.missing(name)
        }
        var found: NSView?
        walk(contentView) { view in
            if let marker = view as? LayoutMarkerView, marker.name == name {
                found = marker
            }
        }
        guard let found else { throw MarkerError.missing(name) }
        let rect = found.convert(found.bounds, to: nil)
        return MarkerFrame(
            topFromWindow: contentView.bounds.height - rect.maxY,
            height: rect.height
        )
    }

    @MainActor
    private func walk(_ view: NSView, visit: (NSView) -> Void) {
        visit(view)
        for subview in view.subviews { walk(subview, visit: visit) }
    }
}

private struct MarkerFrame {
    let topFromWindow: CGFloat
    let height: CGFloat
}

private enum MarkerError: Error {
    case missing(String)
}

private struct ProbePage: View {
    let layout: HubServerNavigationLayout

    private var ignoresTop: Bool {
        HubWorkspaceLayout.pageExtendsUnderTitleBar(layout)
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.blue
            Color.clear.background(LayoutMarker(name: "page"))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea(edges: ignoresTop ? .top : [])
    }
}

private final class LayoutMarkerView: NSView {
    let name: String

    init(name: String) {
        self.name = name
        super.init(frame: .zero)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

private struct LayoutMarker: NSViewRepresentable {
    let name: String

    func makeNSView(context: Context) -> LayoutMarkerView {
        LayoutMarkerView(name: name)
    }

    func updateNSView(_ nsView: LayoutMarkerView, context: Context) {}
}

/// Mounts the app's real window-chrome view (the same one the scene applies as
/// a background) so the test exercises the late-toolbar hiding path.
private struct WindowChromeHost: NSViewRepresentable {
    func makeNSView(context: Context) -> HubWindowChromeView {
        HubWindowChromeView(appearance: .light)
    }

    func updateNSView(_ nsView: HubWindowChromeView, context: Context) {}
}

private struct StubHealthChecker: HealthChecking {
    func checkHealth(origin: URL) async -> HealthCheckOutcome {
        .success(projectName: nil)
    }
}

private final class StubToolbarDelegate: NSObject, NSToolbarDelegate {
    let toggle: NSToolbarItem

    init(toggle: NSToolbarItem) {
        self.toggle = toggle
    }

    func toolbar(
        _ toolbar: NSToolbar,
        itemForItemIdentifier itemIdentifier: NSToolbarItem.Identifier,
        willBeInsertedIntoToolbar flag: Bool
    ) -> NSToolbarItem? {
        itemIdentifier == toggle.itemIdentifier ? toggle : nil
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [toggle.itemIdentifier]
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [toggle.itemIdentifier]
    }
}
