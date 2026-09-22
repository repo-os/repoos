import SwiftUI
import UserNotifications

@main
struct RepoOSHubApp: App {
    @NSApplicationDelegateAdaptor(HubAppDelegate.self) private var appDelegate
    @StateObject private var appState = HubAppState()
    @State private var notificationDelegate = HubNotificationDelegate()

    var body: some Scene {
        WindowGroup("RepoOS") {
            ContentView()
                .environmentObject(appState)
                .frame(minWidth: 880, minHeight: 520)
                .onAppear {
                    UNUserNotificationCenter.current().delegate = notificationDelegate
                    notificationDelegate.requestAuthorizationIfNeeded()
                    notificationDelegate.onOpenNavigation = { serverID, path in
                        appState.handleHubNotificationOpen(serverID: serverID, path: path)
                    }
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
            HubGlobalAttentionSettingsView()
                .environmentObject(appState)
        }
    }
}

final class HubAppDelegate: NSObject, NSApplicationDelegate {
    private let dockIconAppearance = DockIconAppearanceController()

    func applicationDidFinishLaunching(_ notification: Notification) {
        dockIconAppearance.start()
    }
}

/// App icon variants are regular named assets rather than AppIcon appearances:
/// macOS app-icon catalogs do not assign appearance variants to the Dock icon.
final class DockIconAppearanceController {
    private var appearanceObserver: NSKeyValueObservation?

    func start() {
        updateDockIcon()
        appearanceObserver = NSApp.observe(\.effectiveAppearance, options: .new) { [weak self] _, _ in
            self?.updateDockIcon()
        }
    }

    private func updateDockIcon() {
        NSApp.applicationIconImage = NSImage(named: Self.assetName(for: NSApp.effectiveAppearance))
    }

    static func assetName(for appearance: NSAppearance) -> NSImage.Name {
        appearance.bestMatch(from: [.darkAqua]) == .darkAqua ? "DockIconDark" : "DockIconLight"
    }
}
