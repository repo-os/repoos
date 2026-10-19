import SwiftUI
import XCTest
@testable import RepoOSHub

final class HubAppAppearanceTests: XCTestCase {
    func testDefaultsToSystem() {
        XCTAssertEqual(HubGlobalPreferences.default.appearance, .system)
        XCTAssertNil(HubGlobalPreferences.default.appearance.colorScheme)
    }

    func testColorSchemeMapping() {
        XCTAssertNil(HubAppAppearance.system.colorScheme)
        XCTAssertEqual(HubAppAppearance.light.colorScheme, .light)
        XCTAssertEqual(HubAppAppearance.dark.colorScheme, .dark)
        XCTAssertNil(HubAppAppearance.system.appKitAppearance)
        XCTAssertEqual(HubAppAppearance.light.appKitAppearance?.name, .aqua)
        XCTAssertEqual(HubAppAppearance.dark.appKitAppearance?.name, .darkAqua)
    }

    func testLegacyRegistryFileDefaultsAppearanceToSystem() throws {
        let json = """
        {"notificationsEnabled":false,"dockBadgeEnabled":false}
        """.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(HubGlobalPreferences.self, from: json)
        XCTAssertEqual(decoded.appearance, .system)
        XCTAssertFalse(decoded.notificationsEnabled)
        XCTAssertFalse(decoded.dockBadgeEnabled)
    }

    func testUnknownAppearanceValueDefaultsToSystemInsteadOfThrowing() throws {
        // Written by a future build, read by this one: must not throw (which
        // would wipe the registry in reloadFromDisk's catch) and must keep
        // the other preferences intact.
        let json = """
        {"notificationsEnabled":false,"dockBadgeEnabled":true,"appearance":"holographic"}
        """.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(HubGlobalPreferences.self, from: json)
        XCTAssertEqual(decoded.appearance, .system)
        XCTAssertFalse(decoded.notificationsEnabled)
        XCTAssertTrue(decoded.dockBadgeEnabled)
    }

    func testAppearanceRoundTripsThroughRegistryDocument() throws {
        var document = ServerRegistryDocument()
        document.hubGlobalPreferences.appearance = .dark
        let data = try JSONEncoder().encode(document)
        let reloaded = try JSONDecoder().decode(ServerRegistryDocument.self, from: data)
        XCTAssertEqual(reloaded.hubGlobalPreferences.appearance, .dark)
    }

    func testAppearanceRoundTripsEachCase() throws {
        for appearance in HubAppAppearance.allCases {
            var prefs = HubGlobalPreferences.default
            prefs.appearance = appearance
            let data = try JSONEncoder().encode(prefs)
            let reloaded = try JSONDecoder().decode(HubGlobalPreferences.self, from: data)
            XCTAssertEqual(reloaded.appearance, appearance)
        }
    }

    func testSidebarVisibilityMapsCollapsedFlag() {
        XCTAssertEqual(HubSidebarVisibility.visibility(isCollapsed: true), .detailOnly)
        XCTAssertEqual(HubSidebarVisibility.visibility(isCollapsed: false), .all)
        XCTAssertTrue(HubSidebarVisibility.isCollapsed(.detailOnly))
        XCTAssertFalse(HubSidebarVisibility.isCollapsed(.all))
    }

    /// Only an explicit `.detailOnly` counts as collapsed; the system passes
    /// `.automatic` through the binding during split-view setup and a resize
    /// must not persist a bogus collapsed state (#0855).
    func testOnlyDetailOnlyCountsAsCollapsed() {
        XCTAssertFalse(HubSidebarVisibility.isCollapsed(.automatic))
        XCTAssertFalse(HubSidebarVisibility.isCollapsed(.doubleColumn))
    }

    func testSidebarCollapsedFlagRoundTripsThroughDefaultsKey() {
        let defaults = UserDefaults.standard
        let key = HubSidebarVisibility.collapsedDefaultsKey
        let original = defaults.object(forKey: key)
        defer {
            if let original {
                defaults.set(original, forKey: key)
            } else {
                defaults.removeObject(forKey: key)
            }
        }

        defaults.set(true, forKey: key)
        XCTAssertEqual(
            HubSidebarVisibility.visibility(isCollapsed: defaults.bool(forKey: key)),
            .detailOnly
        )
        defaults.set(false, forKey: key)
        XCTAssertEqual(
            HubSidebarVisibility.visibility(isCollapsed: defaults.bool(forKey: key)),
            .all
        )
    }

    /// The workspace window keeps a native titled window (traffic lights,
    /// drag, resize, fullscreen) while hiding the title text and the toolbar
    /// row so the sidebar can run to the top edge (#0855).
    func testWorkspaceWindowChromeHidesTitleAndToolbarButKeepsNativeControls() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 600),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.toolbar = NSToolbar(identifier: "HubChromeTestToolbar")

        configureHubWorkspaceWindowChrome(window)

        XCTAssertEqual(window.titleVisibility, .hidden)
        XCTAssertTrue(window.titlebarAppearsTransparent)
        XCTAssertEqual(window.titlebarSeparatorStyle, .none)
        XCTAssertTrue(window.styleMask.contains(.fullSizeContentView))
        XCTAssertTrue(window.styleMask.contains(.titled))
        XCTAssertTrue(window.styleMask.contains(.closable))
        XCTAssertTrue(window.styleMask.contains(.miniaturizable))
        XCTAssertTrue(window.styleMask.contains(.resizable))
        XCTAssertNotNil(window.standardWindowButton(.closeButton))
        XCTAssertNotNil(window.standardWindowButton(.miniaturizeButton))
        XCTAssertNotNil(window.standardWindowButton(.zoomButton))
        // The transparent titlebar must never take the traffic lights with it
        // (#0857).
        XCTAssertEqual(window.standardWindowButton(.closeButton)?.isHidden, false)
        XCTAssertEqual(window.standardWindowButton(.miniaturizeButton)?.isHidden, false)
        XCTAssertEqual(window.standardWindowButton(.zoomButton)?.isHidden, false)
        XCTAssertEqual(window.toolbar?.isVisible, false)
    }

    /// The collapsed-sidebar reveal tab is a narrow, edge-attached chevron with
    /// the required accessibility label (#0857).
    func testSidebarRevealTabSpecification() {
        XCTAssertGreaterThanOrEqual(HubSidebarRevealTabMetrics.width, 22)
        XCTAssertLessThanOrEqual(HubSidebarRevealTabMetrics.width, 26)
        XCTAssertEqual(HubSidebarRevealTabMetrics.systemImage, "chevron.right")
        XCTAssertEqual(HubSidebarRevealTabMetrics.accessibilityLabel, "Show Sidebar")
    }

    /// Rounded on the trailing edge only, so the tab sits flush against the
    /// window's left edge.
    func testSidebarRevealTabShapeIsSquareOnLeadingEdge() {
        let rect = CGRect(
            x: 0,
            y: 0,
            width: HubSidebarRevealTabMetrics.width,
            height: HubSidebarRevealTabMetrics.height
        )
        let path = HubSidebarRevealTabShape(cornerRadius: HubSidebarRevealTabMetrics.cornerRadius)
            .path(in: rect)

        XCTAssertTrue(path.contains(CGPoint(x: rect.minX + 1, y: rect.minY + 1)))
        XCTAssertFalse(path.contains(CGPoint(x: rect.maxX - 1, y: rect.minY + 1)))
        XCTAssertFalse(path.contains(CGPoint(x: rect.maxX - 1, y: rect.maxY - 1)))
    }

    func testDockIconFollowsChosenAppearanceRegardlessOfSystem() throws {
        let light = NSAppearance(named: .aqua)!
        let dark = NSAppearance(named: .darkAqua)!
        XCTAssertEqual(
            DockIconAppearanceController.assetName(for: dark, override: .light),
            NSImage.Name("DockIconLight")
        )
        XCTAssertEqual(
            DockIconAppearanceController.assetName(for: light, override: .dark),
            NSImage.Name("DockIconDark")
        )
        XCTAssertEqual(
            DockIconAppearanceController.assetName(for: light, override: .system),
            NSImage.Name("DockIconLight")
        )
        XCTAssertEqual(
            DockIconAppearanceController.assetName(for: dark, override: .system),
            NSImage.Name("DockIconDark")
        )
    }
}
