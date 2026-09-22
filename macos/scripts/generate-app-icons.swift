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

func writePNG(_ image: NSImage, to url: URL) throws {
  guard let tiff = image.tiffRepresentation,
        let rep = NSBitmapImageRep(data: tiff),
        let png = rep.representation(using: .png, properties: [:]) else {
    throw NSError(domain: "generate-app-icons", code: 1)
  }
  try png.write(to: url)
}

let scriptURL = URL(fileURLWithPath: CommandLine.arguments[0])
let outDir = scriptURL.deletingLastPathComponent()
  .deletingLastPathComponent()
  .appendingPathComponent("RepoOSHub/Assets.xcassets/AppIcon.appiconset", isDirectory: true)

for name in ["light", "dark"] {
  let theme = themes[name]!
  for size in [512, 1024] {
    let file = outDir.appendingPathComponent("AppIcon-\(size)-\(name).png")
    try writePNG(drawIcon(size: size, theme: theme), to: file)
    fputs("wrote \(file.lastPathComponent)\n", stderr)
  }
}

let contents: [String: Any] = [
  "images": [
    [
      "appearances": [["appearance": "luminosity", "value": "light"]],
      "filename": "AppIcon-512-light.png",
      "idiom": "mac",
      "scale": "1x",
      "size": "512x512",
    ],
    [
      "appearances": [["appearance": "luminosity", "value": "light"]],
      "filename": "AppIcon-1024-light.png",
      "idiom": "mac",
      "scale": "2x",
      "size": "512x512",
    ],
    [
      "appearances": [["appearance": "luminosity", "value": "dark"]],
      "filename": "AppIcon-512-dark.png",
      "idiom": "mac",
      "scale": "1x",
      "size": "512x512",
    ],
    [
      "appearances": [["appearance": "luminosity", "value": "dark"]],
      "filename": "AppIcon-1024-dark.png",
      "idiom": "mac",
      "scale": "2x",
      "size": "512x512",
    ],
  ],
  "info": ["author": "xcode", "version": 1],
]

let jsonData = try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
try jsonData.write(to: outDir.appendingPathComponent("Contents.json"))
fputs("updated Contents.json\n", stderr)
