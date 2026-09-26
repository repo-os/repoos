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
