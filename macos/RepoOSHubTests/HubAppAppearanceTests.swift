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
