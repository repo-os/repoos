import SwiftUI
import UserNotifications

@main
struct RepoOSHubApp: App {
    @NSApplicationDelegateAdaptor(HubAppDelegate.self) private var appDelegate
    @StateObject private var appState = HubAppState()
    @State private var notificationDelegate = HubNotificationDelegate()
    @State private var memoryPressureMonitor: HubMemoryPressureMonitor?

    var body: some Scene {
        WindowGroup("RepoOS") {
            ContentView()
                .environmentObject(appState)
                .frame(minWidth: 880, minHeight: 520)
                .preferredColorScheme(appState.hubGlobalPreferences.appearance.colorScheme)
                .onAppear {
                    UNUserNotificationCenter.current().delegate = notificationDelegate
                    notificationDelegate.requestAuthorizationIfNeeded()
                    notificationDelegate.onOpenNavigation = { serverID, path in
                        appState.handleHubNotificationOpen(serverID: serverID, path: path)
                    }
                    if memoryPressureMonitor == nil {
                        memoryPressureMonitor = HubMemoryPressureMonitor { level in
                            appState.applyWorkspaceResidencyMemoryPressure(level)
                        }
                    }
                    appDelegate.setAppearanceOverride(appState.hubGlobalPreferences.appearance)
                }
                .onChange(of: appState.hubGlobalPreferences.appearance) { newValue in
                    appDelegate.setAppearanceOverride(newValue)
                }
        }
        .commands {
            CommandGroup(after: .newItem) {
                Button("Add Server…") {
                    appState.presentAddServer()
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            }
            CommandMenu("Go") {
                Button("Quick Switcher…") {
                    appState.presentCommandPalette()
                }
                .keyboardShortcut("k", modifiers: .command)

                Divider()

                Button("Back") {
                    appState.workspaceGoBack()
                }
                .keyboardShortcut("[", modifiers: .command)
                .disabled(!appState.workspaceNavigation.canGoBack)

                Button("Forward") {
                    appState.workspaceGoForward()
                }
                .keyboardShortcut("]", modifiers: .command)
                .disabled(!appState.workspaceNavigation.canGoForward)

                Button("Reload") {
                    appState.workspaceReload()
                }
                .keyboardShortcut("r", modifiers: .command)
            }
        }
        Settings {
            HubSettingsView()
                .environmentObject(appState)
        }
    }
}

final class HubAppDelegate: NSObject, NSApplicationDelegate {
    private let dockIconAppearance = DockIconAppearanceController()

    func applicationDidFinishLaunching(_ notification: Notification) {
        dockIconAppearance.start()
    }

    func setAppearanceOverride(_ appearance: HubAppAppearance) {
        dockIconAppearance.appearanceOverride = appearance
    }
}

/// App icon variants are regular named assets rather than AppIcon appearances:
/// macOS app-icon catalogs do not assign appearance variants to the Dock icon.
final class DockIconAppearanceController {
    private var appearanceObserver: NSKeyValueObservation?
    var appearanceOverride: HubAppAppearance = .system {
        didSet { updateDockIcon() }
    }

    func start() {
        updateDockIcon()
        appearanceObserver = NSApp.observe(\.effectiveAppearance, options: .new) { [weak self] _, _ in
            self?.updateDockIcon()
        }
    }

    private func updateDockIcon() {
        NSApp.applicationIconImage = NSImage(named: Self.assetName(for: NSApp.effectiveAppearance, override: appearanceOverride))
    }

    static func assetName(for appearance: NSAppearance) -> NSImage.Name {
        assetName(for: appearance, override: .system)
    }

    static func assetName(for appearance: NSAppearance, override: HubAppAppearance) -> NSImage.Name {
        switch override {
        case .light:
            return "DockIconLight"
        case .dark:
            return "DockIconDark"
        case .system:
            return appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? "DockIconDark" : "DockIconLight"
        }
    }
}
