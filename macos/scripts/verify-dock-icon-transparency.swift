#!/usr/bin/env swift
import AppKit
import Foundation

struct IconCornerFailure: Error, CustomStringConvertible {
  let message: String
  var description: String { message }
}

func repoRoot(from scriptURL: URL) -> URL {
  scriptURL.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
}

func alpha(topLeftX: Int, topLeftY: Int, in rep: NSBitmapImageRep) -> CGFloat {
  let y = rep.pixelsHigh - 1 - topLeftY
  guard let color = rep.colorAt(x: topLeftX, y: y)?.usingColorSpace(.sRGB) else { return -1 }
  return color.alphaComponent
}

func assertTransparentOuterCorners(at url: URL) throws {
  guard let data = try? Data(contentsOf: url),
        let rep = NSBitmapImageRep(data: data) else {
    throw IconCornerFailure(message: "\(url.path): could not load PNG")
  }
  let w = rep.pixelsWide
  let h = rep.pixelsHigh
  guard w > 0, h > 0 else {
    throw IconCornerFailure(message: "\(url.path): empty bitmap")
  }

  let corners = [
    ("top-left", 0, 0),
    ("top-right", w - 1, 0),
    ("bottom-left", 0, h - 1),
    ("bottom-right", w - 1, h - 1),
  ]
  for (label, x, y) in corners {
    let a = alpha(topLeftX: x, topLeftY: y, in: rep)
    if a > 0.01 {
      throw IconCornerFailure(
        message: "\(url.lastPathComponent) \(label) alpha=\(a) (expected transparent)"
      )
    }
  }

  let centerAlpha = alpha(topLeftX: w / 2, topLeftY: h / 2, in: rep)
  if centerAlpha < 0.5 {
    throw IconCornerFailure(
      message: "\(url.lastPathComponent) center alpha=\(centerAlpha) (expected opaque icon body)"
    )
  }
}

let scriptURL = URL(fileURLWithPath: CommandLine.arguments[0])
let assets = repoRoot(from: scriptURL)
  .appendingPathComponent("macos/RepoOSHub/Assets.xcassets", isDirectory: true)

let pngs = [
  assets.appendingPathComponent("DockIconDark.imageset/DockIcon-dark@1x.png"),
  assets.appendingPathComponent("DockIconDark.imageset/DockIcon-dark@2x.png"),
  assets.appendingPathComponent("DockIconLight.imageset/DockIcon-light@1x.png"),
  assets.appendingPathComponent("DockIconLight.imageset/DockIcon-light@2x.png"),
  // AppIcon uses the required default macOS slots. The app switches its
  // light/dark Dock artwork through the named DockIcon image sets above.
  assets.appendingPathComponent("AppIcon.appiconset/AppIcon-512.png"),
  assets.appendingPathComponent("AppIcon.appiconset/AppIcon-1024.png"),
]

do {
  for url in pngs {
    try assertTransparentOuterCorners(at: url)
    fputs("ok \(url.lastPathComponent)\n", stderr)
  }
} catch {
  fputs("error: \(error)\n", stderr)
  exit(1)
}
