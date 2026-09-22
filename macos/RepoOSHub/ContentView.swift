import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var appState: HubAppState

    var body: some View {
        NavigationSplitView {
            ServerSidebarView()
        } detail: {
            WorkspaceDetailView()
                .toolbar { HubWorkspaceToolbar() }
        }
        .sheet(item: $appState.editorSheet) { model in
            ServerEditorSheet(model: model)
                .environmentObject(appState)
        }
        .sheet(
            isPresented: Binding(
                get: { appState.pinTaskContextServerID != nil },
                set: { if !$0 { appState.dismissPinTaskContextSheet() } }
            )
        ) {
            if let serverID = appState.pinTaskContextServerID {
                PinTaskContextSheet(serverID: serverID)
                    .environmentObject(appState)
            }
        }
        .overlay {
            if appState.isCommandPalettePresented {
                HubCommandPaletteView()
                    .environmentObject(appState)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.15), value: appState.isCommandPalettePresented)
        .alert(
            "Local server",
            isPresented: Binding(
                get: { appState.serviceActionMessage != nil },
                set: { if !$0 { appState.serviceActionMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) { appState.serviceActionMessage = nil }
        } message: {
            Text(appState.serviceActionMessage ?? "")
        }
        .sheet(
            isPresented: Binding(
                get: { appState.attentionSettingsServerID != nil },
                set: { if !$0 { appState.dismissAttentionSettingsSheet() } }
            )
        ) {
            if let serverID = appState.attentionSettingsServerID,
               let entry = appState.entries.first(where: { $0.id == serverID })
            {
                HubServerAttentionSettingsSheet(entry: entry)
                    .environmentObject(appState)
            }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(HubAppState())
}
