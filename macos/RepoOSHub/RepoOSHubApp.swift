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
        }
    }
}
