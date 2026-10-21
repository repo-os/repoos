import AppKit
import SwiftUI
import XCTest

/// Offscreen PNG rendering for the Hub's layout snapshots (#0893).
///
/// The suite is deliberately opt-in: without `HUB_SNAPSHOT_DIR` every snapshot
/// test throws `XCTSkip`, so the normal `xcodebuild test` run is unchanged.
/// RepoOS's `[[shot.targets]]` row runs `macos/scripts/hub-snapshots.sh`, which
/// points `HUB_SNAPSHOT_DIR` at the gitignored `REPOOS_SHOT_DIR` for a handoff.
///
/// These images render a view's CONTENT into a bitmap. Nothing is ever shown
/// or ordered front: to let SwiftUI's AppKit-backed `List` build its rows the
/// sidebar render attaches the hosting view to a borderless offscreen window
/// that is never made visible or key. A snapshot therefore cannot show how a
/// real window sizes the view, its toolbar/titlebar chrome, or the traffic
/// lights. Use an XCUITest with `XCTAttachment` when the question is the
/// window itself.
enum HubSnapshotEnvironment {
    /// Output directory. Required: absence disables the whole suite.
    static let directoryVariable = "HUB_SNAPSHOT_DIR"
    /// `shots` keeps the handoff set small (light appearance only).
    static let setVariable = "HUB_SNAPSHOT_SET"

    /// The configured output directory, or nil when snapshots are disabled.
    static var outputDirectory: URL? {
        guard let raw = ProcessInfo.processInfo.environment[directoryVariable]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !raw.isEmpty
        else { return nil }
        return URL(fileURLWithPath: raw, isDirectory: true)
    }

    /// Appearances to render. The handoff set (`HUB_SNAPSHOT_SET=shots`) renders
    /// light only; a manual full run renders light and dark.
    static var appearances: [NSAppearance.Name] {
        if ProcessInfo.processInfo.environment[setVariable] == "shots" {
            return [.aqua]
        }
        return [.aqua, .darkAqua]
    }

    /// Refuse a tracked output location so rendered images can never be
    /// committed: the directory must be inside a `.build` directory, end in
    /// `snapshots`, or live under the gitignored `.attachments/` tree (where
    /// RepoOS hands a command target its `REPOOS_SHOT_DIR`).
    static func validate(_ directory: URL) {
        let path = directory.standardizedFileURL.path
        let components = directory.standardizedFileURL.pathComponents
        if components.contains(".build") || components.last == "snapshots" {
            return
        }
        if components.contains(".attachments") {
            return
        }
        if let shot = ProcessInfo.processInfo.environment["REPOOS_SHOT_DIR"], !shot.isEmpty {
            let shotPath = URL(fileURLWithPath: shot).standardizedFileURL.path
            if path == shotPath && shotPath.contains("/.attachments/") {
                return
            }
        }
        preconditionFailure(
            "\(directoryVariable) must point at an ignored path (inside '.build', ending in 'snapshots', or under the RepoOS '.attachments/' tree)."
        )
    }
}

/// Shared render + write helpers for the Hub snapshot suite.
@MainActor
enum HubSnapshotRenderer {
    enum RenderError: Error, CustomStringConvertible {
        case noBitmap
        case emptyBitmap(String)
        case pngEncodingFailed

        var description: String {
            switch self {
            case .noBitmap:
                return "AppKit returned no bitmap for the offscreen render"
            case .emptyBitmap(let name):
                return "the offscreen render of \(name) was blank (no usable graphics context)"
            case .pngEncodingFailed:
                return "the rendered bitmap could not be encoded as PNG"
            }
        }
    }

    static func render(
        _ content: AnyView,
        size: CGSize,
        appearance: NSAppearance.Name,
        name: String
    ) throws -> NSBitmapImageRep {
        let host = NSHostingView(
            rootView: content.environment(\.controlActiveState, .key)
        )
        host.frame = NSRect(origin: .zero, size: size)
        host.appearance = NSAppearance(named: appearance)
        host.layoutSubtreeIfNeeded()

        // SwiftUI's List is AppKit-backed and only builds its rows once it has
        // a host window. This window is created offscreen and is never shown,
        // made key, or ordered front — nothing appears on screen — but it lets
        // the list lay out its rows so the snapshot shows the sidebar rather
        // than an empty well. It is released before returning.
        let hostWindow = NSWindow(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless],
            backing: .buffered,
            defer: true
        )
        hostWindow.isReleasedWhenClosed = false
        hostWindow.appearance = NSAppearance(named: appearance)
        hostWindow.contentView = host
        hostWindow.setFrame(NSRect(origin: .zero, size: size), display: false)
        hostWindow.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        host.layoutSubtreeIfNeeded()
        defer { hostWindow.contentView = nil }

        guard let cacheRep = host.bitmapImageRepForCachingDisplay(in: host.bounds) else {
            throw RenderError.noBitmap
        }
        let rep = cacheRep.retagging(with: .sRGB) ?? cacheRep
        host.cacheDisplay(in: host.bounds, to: rep)
        guard hasVisiblePixels(rep) else {
            throw RenderError.emptyBitmap(name)
        }
        return rep
    }

    static func write(_ rep: NSBitmapImageRep, name: String, to directory: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        guard let png = rep.representation(using: .png, properties: [:]) else {
            throw RenderError.pngEncodingFailed
        }
        try png.write(to: directory.appendingPathComponent("\(name).png"), options: .atomic)
    }

    /// A blank bitmap means AppKit had no graphics context (a headless run).
    private static func hasVisiblePixels(_ rep: NSBitmapImageRep) -> Bool {
        let width = rep.pixelsWide
        let height = rep.pixelsHigh
        guard width > 0, height > 0 else { return false }
        // Scan everything: a summary popover is mostly transparent gaps between
        // glyphs, so a sparse grid can miss every visible pixel.
        for y in 0..<height {
            for x in 0..<width {
                if let color = rep.colorAt(x: x, y: y), color.alphaComponent > 0.01 {
                    return true
                }
            }
        }
        return false
    }
}
