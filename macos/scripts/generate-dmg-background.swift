#!/usr/bin/env swift
import AppKit

let size = NSSize(width: 720, height: 440)
let image = NSImage(size: size)
image.lockFocus()

guard let context = NSGraphicsContext.current?.cgContext else {
  fatalError("no graphics context")
}

let background = NSBezierPath(rect: NSRect(origin: .zero, size: size))
let colors = [
  NSColor(srgbRed: 0.027, green: 0.043, blue: 0.102, alpha: 1).cgColor,
  NSColor(srgbRed: 0.075, green: 0.11, blue: 0.22, alpha: 1).cgColor,
] as CFArray
let space = CGColorSpaceCreateDeviceRGB()
let gradient = CGGradient(colorsSpace: space, colors: colors, locations: [0, 1])!
context.saveGState()
background.addClip()
context.drawLinearGradient(
  gradient,
  start: CGPoint(x: 0, y: 0),
  end: CGPoint(x: size.width, y: size.height),
  options: []
)
context.restoreGState()

func draw(_ text: String, at point: NSPoint, font: NSFont, color: NSColor) {
  (text as NSString).draw(
    at: point,
    withAttributes: [.font: font, .foregroundColor: color]
  )
}

func drawCentered(_ text: String, in rect: NSRect, font: NSFont, color: NSColor) {
  let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
  let size = (text as NSString).size(withAttributes: attributes)
  let point = NSPoint(
    x: rect.midX - size.width / 2,
    y: rect.midY - size.height / 2
  )
  (text as NSString).draw(at: point, withAttributes: attributes)
}

let cyan = NSColor(srgbRed: 0.22, green: 0.88, blue: 1, alpha: 1)
let violet = NSColor(srgbRed: 0.62, green: 0.48, blue: 1, alpha: 1)
let eyebrow = NSBezierPath(roundedRect: NSRect(x: 54, y: 372, width: 116, height: 25), xRadius: 12, yRadius: 12)
NSColor(srgbRed: 0.12, green: 0.2, blue: 0.36, alpha: 1).setFill()
eyebrow.fill()
draw("REPOOS HUB", at: NSPoint(x: 67, y: 378), font: .monospacedSystemFont(ofSize: 10, weight: .bold), color: cyan)
draw("Install RepoOS Hub", at: NSPoint(x: 52, y: 320), font: .systemFont(ofSize: 29, weight: .bold), color: .white)
draw("Drag the app to Applications to get started.", at: NSPoint(x: 54, y: 286), font: .systemFont(ofSize: 15), color: NSColor(white: 0.78, alpha: 1))

let arrow = NSBezierPath()
arrow.move(to: NSPoint(x: 290, y: 179))
arrow.line(to: NSPoint(x: 426, y: 179))
arrow.lineWidth = 5
arrow.lineCapStyle = .round
cyan.setStroke()
arrow.stroke()
let head = NSBezierPath()
head.move(to: NSPoint(x: 412, y: 193))
head.line(to: NSPoint(x: 428, y: 179))
head.line(to: NSPoint(x: 412, y: 165))
head.lineWidth = 5
head.lineCapStyle = .round
head.lineJoinStyle = .round
violet.setStroke()
head.stroke()
draw("Drag to install", at: NSPoint(x: 310, y: 136), font: .systemFont(ofSize: 13, weight: .medium), color: NSColor(white: 0.68, alpha: 1))
drawCentered("RepoOS Hub", in: NSRect(x: 112, y: 54, width: 120, height: 22), font: .systemFont(ofSize: 13, weight: .medium), color: .white)
drawCentered("Applications", in: NSRect(x: 488, y: 54, width: 120, height: 22), font: .systemFont(ofSize: 13, weight: .medium), color: .white)
image.unlockFocus()

guard let rep = NSBitmapImageRep(
  bitmapDataPlanes: nil,
  pixelsWide: Int(size.width),
  pixelsHigh: Int(size.height),
  bitsPerSample: 8,
  samplesPerPixel: 4,
  hasAlpha: true,
  isPlanar: false,
  colorSpaceName: .deviceRGB,
  bytesPerRow: 0,
  bitsPerPixel: 0
) else { fatalError("could not create bitmap") }
guard let bitmapContext = NSGraphicsContext(bitmapImageRep: rep) else {
  fatalError("could not create bitmap context")
}
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = bitmapContext
image.draw(in: NSRect(origin: .zero, size: size))
NSGraphicsContext.restoreGraphicsState()
guard let png = rep.representation(using: .png, properties: [:]) else {
  fatalError("could not encode background")
}

let scriptURL = URL(fileURLWithPath: CommandLine.arguments[0])
let output = scriptURL.deletingLastPathComponent()
  .deletingLastPathComponent()
  .appendingPathComponent("assets/RepoOSHub-install-background.png")
try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
try png.write(to: output)
fputs("wrote \(output.path)\n", stderr)
