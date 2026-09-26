import SwiftUI

struct HubWorkspaceToolbar: ToolbarContent {
    @EnvironmentObject private var appState: HubAppState

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .navigation) {
            Button {
                appState.workspaceGoBack()
            } label: {
                Label("Back", systemImage: "chevron.left")
            }
            .help(backHelp)
            .disabled(!appState.workspaceNavigation.canGoBack)
            .accessibilityLabel("Back in web workspace")

            Button {
                appState.workspaceGoForward()
            } label: {
                Label("Forward", systemImage: "chevron.right")
            }
            .help(forwardHelp)
            .disabled(!appState.workspaceNavigation.canGoForward)
            .accessibilityLabel("Forward in web workspace")

            Button {
                appState.workspaceReload()
            } label: {
                Label("Reload", systemImage: "arrow.clockwise")
            }
            .help(reloadHelp)
            .disabled(!appState.workspaceNavigation.canReload)
            .accessibilityLabel("Reload web workspace")
        }
        ToolbarItem(placement: .primaryAction) {
            Button {
                HubSettingsOpener.open()
            } label: {
                Image(systemName: "ellipsis")
                    .rotationEffect(.degrees(90))
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .help("RepoOS Hub settings")
            .accessibilityLabel("RepoOS Hub settings")
            .focusable()
            .buttonStyle(.plain)
        }
    }

    private var backHelp: String {
        appState.workspaceNavigation.canGoBack
            ? "Go back in the RepoOS page"
            : "Back is unavailable until the embedded web view has history"
    }

    private var forwardHelp: String {
        appState.workspaceNavigation.canGoForward
            ? "Go forward in the RepoOS page"
            : "Forward is unavailable until the embedded web view has history"
    }

    private var reloadHelp: String {
        appState.workspaceNavigation.hasEmbeddedWebContent
            ? "Reload the RepoOS page"
            : "Reload checks the server connection"
    }
}
