import SwiftUI

@main
struct RepoOSHubApp: App {
    @StateObject private var appState = HubAppState()

    var body: some Scene {
        WindowGroup("RepoOS Hub") {
            ContentView()
                .environmentObject(appState)
                .frame(minWidth: 880, minHeight: 520)
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
    }
}
