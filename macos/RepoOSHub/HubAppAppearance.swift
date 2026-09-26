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
