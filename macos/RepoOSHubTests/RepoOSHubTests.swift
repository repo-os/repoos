import AppKit
import XCTest
@testable import RepoOSHub

final class RepoOSHubTests: XCTestCase {
    func testScaffoldHasStableAppIdentity() throws {
        XCTAssertEqual(Bundle(for: Self.self).bundleIdentifier, "org.repoos.hub.tests")
    }

    func testDockIconTracksLightAndDarkAppearance() throws {
        XCTAssertEqual(
            DockIconAppearanceController.assetName(for: NSAppearance(named: .aqua)!),
            NSImage.Name("DockIconLight")
        )
        XCTAssertEqual(
            DockIconAppearanceController.assetName(for: NSAppearance(named: .darkAqua)!),
            NSImage.Name("DockIconDark")
        )
    }
}
