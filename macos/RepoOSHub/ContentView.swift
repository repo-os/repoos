import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var appState: HubAppState
    @AppStorage(HubSidebarVisibility.collapsedDefaultsKey) private var isSidebarCollapsed = false

    /// The split view drives its own visibility, but the persisted flag is the
    /// source of truth so collapsing the sidebar survives a relaunch (#0855).
    private var columnVisibility: Binding<NavigationSplitViewVisibility> {
        Binding(
            get: {
                // Tabs mode hides the sidebar column without writing the
                // persisted collapsed flag, so returning to Sidebar restores it.
                if usesTabStrip { return .detailOnly }
                return HubSidebarVisibility.visibility(isCollapsed: isSidebarCollapsed)
            },
            set: { newValue in
                guard !usesTabStrip else { return }
                isSidebarCollapsed = HubSidebarVisibility.isCollapsed(newValue)
            }
        )
    }

    private var usesTabStrip: Bool {
        appState.hubGlobalPreferences.navigationLayout == .tabs
    }

    var body: some View {
        // One NavigationSplitView and one WorkspaceDetailView for both layouts.
        // An if/else that builds a second workspace destroys the WKWebViews
        // when the user switches between Sidebar and Tabs.
        NavigationSplitView(columnVisibility: columnVisibility) {
            ServerSidebarView(columnVisibility: columnVisibility)
        } detail: {
            // One chrome container for both layouts: Tabs adds the strip as a
            // real top row (content starts below it); Sidebar adds nothing and
            // the page keeps the reclaimed titlebar band (#0895).
            HubWorkspaceChrome(layout: appState.hubGlobalPreferences.navigationLayout) {
                WorkspaceDetailView()
            }
        }
        // The reveal tab lives on the split view, not the detail column, so it
        // sits flush against the window's left edge when the sidebar collapses
        // instead of inheriting the detail column's leading inset (#0857).
        .overlay(alignment: .topLeading) {
            if !usesTabStrip && isSidebarCollapsed {
                HubSidebarRevealTab {
                    isSidebarCollapsed = false
                }
                .padding(.top, 8)
            }
        }
        // The Hub has no visible titlebar or toolbar row: the sidebar runs to
        // the window's top edge and the workspace fills the reclaimed space.
        // The titlebar stays transparent and button-only so the native
        // traffic lights remain visible over the sidebar (#0855, #0857).
        // Never use `.toolbar(.hidden, for: .windowToolbar)` here: SwiftUI
        // hides the whole titlebar container with it, taking the native
        // traffic lights with it. The AppKit configurator hides only the
        // toolbar row.
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
