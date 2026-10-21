import AppKit
import XCTest
@testable import RepoOSHub

final class RepoOSHubTests: XCTestCase {
    func testScaffoldHasStableAppIdentity() throws {
        XCTAssertEqual(Bundle(for: Self.self).bundleIdentifier, "org.repoos.hub.tests")
    }

    /// #0859 E4: a new Hub window fills most of the visible screen instead of
    /// opening at its 880x520 minimum, and still never shrinks below it.
    func testDefaultWindowSizeFillsMostOfTheVisibleFrame() {
        let visible = CGRect(x: 0, y: 0, width: 1600, height: 1000)
        let size = HubWindowDefaults.defaultWindowSize(for: visible)
        XCTAssertEqual(size.width, 1440, accuracy: 0.5)
        XCTAssertEqual(size.height, 900, accuracy: 0.5)
    }

    func testDefaultWindowSizeClampsToTheMinimumOnASmallScreen() {
        let small = HubWindowDefaults.defaultWindowSize(
            for: CGRect(x: 0, y: 0, width: 800, height: 400)
        )
        XCTAssertEqual(small.width, HubWindowDefaults.minWidth)
        XCTAssertEqual(small.height, HubWindowDefaults.minHeight)

        let tiny = HubWindowDefaults.defaultWindowSize(
            for: CGRect(x: 0, y: 0, width: 640, height: 480)
        )
        XCTAssertEqual(tiny.width, HubWindowDefaults.minWidth)
        XCTAssertEqual(tiny.height, HubWindowDefaults.minHeight)
    }

    func testDefaultWindowSizeFallsBackToTheMinimumWithoutAScreen() {
        let size = HubWindowDefaults.defaultWindowSize(for: nil)
        XCTAssertEqual(size.width, HubWindowDefaults.minWidth)
        XCTAssertEqual(size.height, HubWindowDefaults.minHeight)
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

    func testGeneratedHubIconsHaveTransparentOuterCorners() throws {
        let assets = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("RepoOSHub/Assets.xcassets", isDirectory: true)

        let pngs = [
            assets.appendingPathComponent("DockIconDark.imageset/DockIcon-dark@1x.png"),
            assets.appendingPathComponent("DockIconDark.imageset/DockIcon-dark@2x.png"),
            assets.appendingPathComponent("DockIconLight.imageset/DockIcon-light@1x.png"),
            assets.appendingPathComponent("DockIconLight.imageset/DockIcon-light@2x.png"),
            assets.appendingPathComponent("AppIcon.appiconset/AppIcon-512.png"),
            assets.appendingPathComponent("AppIcon.appiconset/AppIcon-1024.png"),
        ]

        for url in pngs {
            let data = try Data(contentsOf: url)
            guard let rep = NSBitmapImageRep(data: data) else {
                XCTFail("could not decode \(url.lastPathComponent)")
                continue
            }
            let width = rep.pixelsWide
            let height = rep.pixelsHigh
            let corners = [
                ("top-left", 0, 0),
                ("top-right", width - 1, 0),
                ("bottom-left", 0, height - 1),
                ("bottom-right", width - 1, height - 1),
            ]
            for (label, x, y) in corners {
                let alpha = Self.alpha(topLeftX: x, topLeftY: y, in: rep)
                XCTAssertLessThanOrEqual(
                    alpha,
                    0.01,
                    "\(url.lastPathComponent) \(label) should be transparent, got alpha \(alpha)"
                )
            }
            let centerAlpha = Self.alpha(topLeftX: width / 2, topLeftY: height / 2, in: rep)
            XCTAssertGreaterThan(
                centerAlpha,
                0.5,
                "\(url.lastPathComponent) center should be opaque, got alpha \(centerAlpha)"
            )
        }
    }

    private static func alpha(topLeftX: Int, topLeftY: Int, in rep: NSBitmapImageRep) -> CGFloat {
        let y = rep.pixelsHigh - 1 - topLeftY
        guard let color = rep.colorAt(x: topLeftX, y: y)?.usingColorSpace(.sRGB) else { return -1 }
        return color.alphaComponent
    }
}
