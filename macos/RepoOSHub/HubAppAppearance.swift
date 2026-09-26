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
        switch self {
        case .system: return .windowBackgroundColor
        case .light: return .white
        case .dark:
            // Match the charcoal backing used by macOS's dark window chrome;
            // a pure black frame makes the split-view edge look detached.
            return NSColor(calibratedWhite: 0.12, alpha: 1)
        }
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
