import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var appState: HubAppState
    @AppStorage(HubSidebarVisibility.collapsedDefaultsKey) private var isSidebarCollapsed = false

    /// The split view drives its own visibility, but the persisted flag is the
    /// source of truth so collapsing the sidebar survives a relaunch (#0855).
    private var columnVisibility: Binding<NavigationSplitViewVisibility> {
        Binding(
            get: { HubSidebarVisibility.visibility(isCollapsed: isSidebarCollapsed) },
            set: { isSidebarCollapsed = HubSidebarVisibility.isCollapsed($0) }
        )
    }

    var body: some View {
        NavigationSplitView(columnVisibility: columnVisibility) {
            ServerSidebarView(columnVisibility: columnVisibility)
        } detail: {
            WorkspaceDetailView()
                .overlay(alignment: .topLeading) {
                    if isSidebarCollapsed {
                        HubSidebarRevealButton {
                            isSidebarCollapsed = false
                        }
                        .padding(.leading, 10)
                        .padding(.top, 8)
                    }
                }
        }
        // The Hub has no native titlebar or toolbar row: the sidebar runs to
        // the window's top edge and the workspace fills the reclaimed space.
        // Traffic lights, dragging, resizing, minimize, and fullscreen stay
        // native because this is still an ordinary titled NSWindow (#0855).
        .toolbar(.hidden, for: .windowToolbar)
        // NavigationSplitView leaves a narrow native frame around the sidebar
        // and its bottom inset. Keep that exposed frame on the same surface.
        .background {
            shellBackground
                .ignoresSafeArea()
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

    private var shellBackground: Color {
        switch appState.hubGlobalPreferences.appearance {
        case .dark:
            return Color(red: 0.12, green: 0.12, blue: 0.12)
        case .light, .system:
            return .white
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(HubAppState())
}
