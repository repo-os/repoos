#!/usr/bin/env swift
import AppKit

struct Theme {
  let bg2: NSColor
  let cyan: NSColor
  let violet: NSColor
}

let themes: [String: Theme] = [
  "light": Theme(
    bg2: NSColor(hex: 0xEEF0F6),
    cyan: NSColor(hex: 0x0678B3),
    violet: NSColor(hex: 0x6B3FC0)
  ),
  "dark": Theme(
    bg2: NSColor(hex: 0x0B1020),
    cyan: NSColor(hex: 0x39E0FF),
    violet: NSColor(hex: 0x9D7BFF)
  ),
]

extension NSColor {
  convenience init(hex: UInt32) {
    let r = CGFloat((hex >> 16) & 0xFF) / 255
    let g = CGFloat((hex >> 8) & 0xFF) / 255
    let b = CGFloat(hex & 0xFF) / 255
    self.init(srgbRed: r, green: g, blue: b, alpha: 1)
  }
}

func drawIcon(size: Int, theme: Theme) -> NSImage {
  let s = CGFloat(size)
  let outerRadius = s * 9 / 30
  let inset = s * 3 / 30
  let innerRadius = s * 6 / 30
  let svgScale = s * 14 / 30

  let image = NSImage(size: NSSize(width: s, height: s))
  image.lockFocus()
  defer { image.unlockFocus() }

  guard let ctx = NSGraphicsContext.current?.cgContext else {
    fatalError("no graphics context")
  }

  theme.bg2.setFill()
  NSBezierPath(rect: NSRect(x: 0, y: 0, width: s, height: s)).fill()

  let outerRect = NSRect(x: 0, y: 0, width: s, height: s)
  let outerPath = NSBezierPath(roundedRect: outerRect, xRadius: outerRadius, yRadius: outerRadius)

  ctx.saveGState()
  outerPath.addClip()

  let center = CGPoint(x: s / 2, y: s / 2)
  let startAngle = CGFloat(200) * .pi / 180
  let steps = 720
  for i in 0..<steps {
    let t = CGFloat(i) / CGFloat(steps)
    let color: NSColor
    if t < 0.5 {
      color = theme.cyan.blended(withFraction: t * 2, of: theme.violet) ?? theme.cyan
    } else {
      color = theme.violet.blended(withFraction: (t - 0.5) * 2, of: theme.cyan) ?? theme.violet
    }
    let a0 = startAngle + t * 2 * .pi
    let a1 = startAngle + CGFloat(i + 1) / CGFloat(steps) * 2 * .pi
    let radius = s * 0.75
    let p0 = CGPoint(x: center.x + cos(a0) * radius, y: center.y + sin(a0) * radius)
    let p1 = CGPoint(x: center.x + cos(a1) * radius, y: center.y + sin(a1) * radius)
    ctx.setFillColor(color.cgColor)
    ctx.move(to: center)
    ctx.addLine(to: p0)
    ctx.addLine(to: p1)
    ctx.closePath()
    ctx.fillPath()
  }
  ctx.restoreGState()

  let innerRect = NSRect(
    x: inset,
    y: inset,
    width: s - inset * 2,
    height: s - inset * 2
  )
  let innerPath = NSBezierPath(roundedRect: innerRect, xRadius: innerRadius, yRadius: innerRadius)
  theme.bg2.setFill()
  innerPath.fill()

  let svgData = """
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="\(svgScale)" height="\(svgScale)">
    <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" fill="none" stroke="#\(theme.cyan.hexRGB)" stroke-width="2" stroke-linejoin="round"/>
    <path d="M12 7v10M8 9.5v5M16 9.5v5" fill="none" stroke="#\(theme.violet.hexRGB)" stroke-width="1.5" stroke-linecap="round"/>
  </svg>
  """.data(using: .utf8)!

  if let rep = NSImage(data: svgData) {
    let origin = NSPoint(x: (s - svgScale) / 2, y: (s - svgScale) / 2)
    rep.draw(in: NSRect(x: origin.x, y: origin.y, width: svgScale, height: svgScale))
  }

  return image
}

extension NSColor {
  var hexRGB: String {
    guard let rgb = usingColorSpace(.sRGB) else { return "000000" }
    let r = Int(round(rgb.redComponent * 255))
    let g = Int(round(rgb.greenComponent * 255))
    let b = Int(round(rgb.blueComponent * 255))
    return String(format: "%02X%02X%02X", r, g, b)
  }
}

func writePNG(_ image: NSImage, size: Int, to url: URL) throws {
  guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: size,
    pixelsHigh: size,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ), let context = NSGraphicsContext(bitmapImageRep: rep) else {
    throw NSError(domain: "generate-app-icons", code: 1)
  }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  image.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
  NSGraphicsContext.restoreGraphicsState()

  guard let png = rep.representation(using: NSBitmapImageRep.FileType.png, properties: [:]) else {
    throw NSError(domain: "generate-app-icons", code: 1)
  }
  try png.write(to: url)
}

let scriptURL = URL(fileURLWithPath: CommandLine.arguments[0])
let assetsDir = scriptURL.deletingLastPathComponent()
  .deletingLastPathComponent()
  .appendingPathComponent("RepoOSHub/Assets.xcassets", isDirectory: true)
let appIconDir = assetsDir.appendingPathComponent("AppIcon.appiconset", isDirectory: true)

for staleFile in ["AppIcon-512-dark.png", "AppIcon-1024-dark.png"] {
  try? FileManager.default.removeItem(at: appIconDir.appendingPathComponent(staleFile))
}

func writeContents(_ contents: [String: Any], to url: URL) throws {
  var jsonData = try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
  jsonData.append(0x0A)
  try jsonData.write(to: url)
}

for size in [512, 1024] {
  let file = appIconDir.appendingPathComponent("AppIcon-\(size)-light.png")
  try writePNG(drawIcon(size: size, theme: themes["light"]!), size: size, to: file)
  fputs("wrote \(file.lastPathComponent)\n", stderr)
}

let contents: [String: Any] = [
  "images": [
    [
      "filename": "AppIcon-512-light.png",
      "idiom": "mac",
      "scale": "1x",
      "size": "512x512",
    ],
    [
      "filename": "AppIcon-1024-light.png",
      "idiom": "mac",
      "scale": "2x",
      "size": "512x512",
    ],
  ],
  "info": ["author": "xcode", "version": 1],
]

try writeContents(contents, to: appIconDir.appendingPathComponent("Contents.json"))

for name in ["light", "dark"] {
  let dockIconDir = assetsDir.appendingPathComponent("DockIcon\(name.capitalized).imageset", isDirectory: true)
  try FileManager.default.createDirectory(at: dockIconDir, withIntermediateDirectories: true)
  let file = dockIconDir.appendingPathComponent("DockIcon-\(name).png")
  try writePNG(drawIcon(size: 1024, theme: themes[name]!), size: 1024, to: file)
  try writeContents([
    "images": [["filename": file.lastPathComponent, "idiom": "universal", "scale": "1x"]],
    "info": ["author": "xcode", "version": 1],
  ], to: dockIconDir.appendingPathComponent("Contents.json"))
  fputs("wrote \(file.lastPathComponent)\n", stderr)
}
