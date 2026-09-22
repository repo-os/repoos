import SwiftUI
import UserNotifications

@main
struct RepoOSHubApp: App {
    @StateObject private var appState = HubAppState()
    @State private var notificationDelegate = HubNotificationDelegate()
    @State private var memoryPressureMonitor: HubMemoryPressureMonitor?

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
                    if memoryPressureMonitor == nil {
                        memoryPressureMonitor = HubMemoryPressureMonitor { level in
                            appState.applyWorkspaceResidencyMemoryPressure(level)
                        }
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
