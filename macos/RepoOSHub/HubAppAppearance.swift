import AppKit
import SwiftUI

/// The Hub shell theme. System is the default so existing users see no change.
/// This applies only to the native SwiftUI shell — it is never injected,
/// forced, or bridged into any WKWebView, which keeps its own web theme.
enum HubAppAppearance: String, Codable, Equatable, Sendable, CaseIterable {
  case system
  case light
  case dark

  var displayName: String {
    switch self {
    case .system: return "System"
    case .light: return "Light"
    case .dark: return "Dark"
    }
  }

  /// The SwiftUI override. Nil means follow the system.
  var colorScheme: ColorScheme? {
    switch self {
    case .system: return nil
    case .light: return .light
    case .dark: return .dark
    }
  }

  /// The AppKit override for native window chrome such as title bars and
  /// toolbars. Nil leaves the entire app following the system appearance.
  var appKitAppearance: NSAppearance? {
    switch self {
    case .system: return nil
    case .light: return NSAppearance(named: .aqua)
    case .dark: return NSAppearance(named: .darkAqua)
    }
  }

  /// A concrete backing color for the rounded native window frame. Using
  /// windowBackgroundColor here can resolve through the system appearance
  /// instead of the Hub override, leaving a dark strip around a Light shell.
  var appKitWindowBackgroundColor: NSColor {
    Self.windowBackgroundColor(for: self, systemAppearance: HubSystemAppearance.appearance)
  }

  func appKitWindowBackgroundColor(systemAppearance: NSAppearance) -> NSColor {
    Self.windowBackgroundColor(for: self, systemAppearance: systemAppearance)
  }

  func selectedTabBackgroundColor(for systemColorScheme: ColorScheme) -> Color {
    let systemAppearance = NSAppearance(
      named: systemColorScheme == .dark ? .darkAqua : .aqua
    )!
    return Color(
      nsColor: selectedTabBackgroundNSColor(
        for: systemColorScheme, systemAppearance: systemAppearance))
  }

  func selectedTabBackgroundNSColor(
    for systemColorScheme: ColorScheme,
    systemAppearance: NSAppearance? = nil
  ) -> NSColor {
    let appearance =
      systemAppearance ?? NSAppearance(
        named: systemColorScheme == .dark ? .darkAqua : .aqua
      )!
    let resolvedLabelColor = Self.resolvedColor(
      NSColor.labelColor,
      for: self,
      systemAppearance: appearance
    )
    return resolvedLabelColor.withAlphaComponent(0.08)
  }

  /// Resolve AppKit's semantic window surface against the appearance the Hub
  /// actually requests. A dynamic NSColor's bare `cgColor` can otherwise be
  /// resolved as Aqua while SwiftUI is drawing Dark text and controls.
  static func windowBackgroundColor(
    for preference: HubAppAppearance,
    systemAppearance: NSAppearance
  ) -> NSColor {
    resolvedColor(
      NSColor.windowBackgroundColor, for: preference, systemAppearance: systemAppearance)
  }

  private static func resolvedColor(
    _ color: NSColor,
    for preference: HubAppAppearance,
    systemAppearance: NSAppearance
  ) -> NSColor {
    let effectiveAppearance = preference.appKitAppearance ?? systemAppearance
    var resolvedColor: NSColor?
    effectiveAppearance.performAsCurrentDrawingAppearance {
      guard let rgb = color.usingColorSpace(.deviceRGB) else { return }
      resolvedColor = NSColor(
        calibratedRed: rgb.redComponent,
        green: rgb.greenComponent,
        blue: rgb.blueComponent,
        alpha: rgb.alphaComponent
      )
    }
    return resolvedColor ?? color
  }

  func shellBackgroundColor(for systemColorScheme: ColorScheme) -> Color {
    Color(nsColor: shellBackgroundNSColor(for: systemColorScheme))
  }

  func shellBackgroundNSColor(
    for systemColorScheme: ColorScheme,
    systemAppearance: NSAppearance? = nil
  ) -> NSColor {
    let appearance =
      systemAppearance ?? NSAppearance(
        named: systemColorScheme == .dark ? .darkAqua : .aqua
      )!
    return Self.windowBackgroundColor(for: self, systemAppearance: appearance)
  }
}

/// The macOS system appearance, read directly from the global defaults domain
/// rather than from `NSApp.effectiveAppearance`. That bypasses the app object
/// entirely, so it cannot resolve to the Hub's own SwiftUI override by
/// construction — it is always what the system (and `prefers-color-scheme`
/// web content) means by light/dark.
enum HubSystemAppearance {
  static var isDark: Bool {
    UserDefaults.standard.string(forKey: "AppleInterfaceStyle") == "Dark"
  }

  static var appearance: NSAppearance {
    NSAppearance(named: isDark ? .darkAqua : .aqua)!
  }

  static var themeChangedNotification: NSNotification.Name {
    NSNotification.Name("AppleInterfaceThemeChangedNotification")
  }
}
