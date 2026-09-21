import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var appState: HubAppState

    var body: some View {
        NavigationSplitView {
            ServerSidebarView()
        } detail: {
            WorkspaceDetailView()
        }
        .sheet(item: $appState.editorSheet) { model in
            ServerEditorSheet(model: model)
                .environmentObject(appState)
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(HubAppState())
}
