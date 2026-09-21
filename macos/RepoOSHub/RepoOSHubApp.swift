import SwiftUI

@main
struct RepoOSHubApp: App {
    var body: some Scene {
        WindowGroup("RepoOS Hub") {
            ContentView()
                .frame(minWidth: 720, minHeight: 460)
        }
        .windowResizability(.contentSize)
    }
}
