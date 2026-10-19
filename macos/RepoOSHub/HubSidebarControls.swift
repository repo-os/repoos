import SwiftUI

/// Shared, testable mapping between the persisted sidebar-collapsed flag and
/// SwiftUI's split-view visibility.
///
/// The Hub keeps the native sidebar's collapsed state across launches (the same
/// behavior the system toolbar toggle provided before the titlebar was removed,
/// #0855). Only `.detailOnly` means "collapsed"; `.all`, `.automatic`, and
/// `.doubleColumn` all leave the side bar visible.
enum HubSidebarVisibility {
    static let collapsedDefaultsKey = "RepoOSHub.sidebarCollapsed"

    static func isCollapsed(_ visibility: NavigationSplitViewVisibility) -> Bool {
        visibility == .detailOnly
    }

    static func visibility(isCollapsed: Bool) -> NavigationSplitViewVisibility {
        isCollapsed ? .detailOnly : .all
    }
}

/// Compact native navigation controls that replaced the window toolbar when the
/// Hub stopped showing a native titlebar (#0855).
///
/// These live at the top of the sidebar so navigation stays near the content it
/// controls, and they deliberately stay quiet: SF Symbols, native tooltips, and
/// hover states only, never a competing navigation system beside the embedded
/// RepoOS web UI.
struct HubSidebarNavigationBar: View {
    @EnvironmentObject private var appState: HubAppState
    @Binding var columnVisibility: NavigationSplitViewVisibility

    var body: some View {
        HStack(spacing: 2) {
            HubSidebarIconButton(
                systemImage: "chevron.left",
                accessibilityLabel: "Back in web workspace",
                help: backHelp,
                action: appState.workspaceGoBack
            )
            .disabled(!appState.workspaceNavigation.canGoBack)

            HubSidebarIconButton(
                systemImage: "chevron.right",
                accessibilityLabel: "Forward in web workspace",
                help: forwardHelp,
                action: appState.workspaceGoForward
            )
            .disabled(!appState.workspaceNavigation.canGoForward)

            HubSidebarIconButton(
                systemImage: "arrow.clockwise",
                accessibilityLabel: "Reload web workspace",
                help: reloadHelp,
                action: appState.workspaceReload
            )
            .disabled(!appState.workspaceNavigation.canReload)

            Spacer(minLength: 0)

            HubSidebarIconButton(
                systemImage: "sidebar.leading",
                accessibilityLabel: "Hide the native sidebar",
                help: "Hide the native sidebar",
                action: hideSidebar
            )
        }
        .padding(.horizontal, 10)
        .padding(.top, 2)
        .padding(.bottom, 8)
        .accessibilityElement(children: .contain)
    }

    private func hideSidebar() {
        columnVisibility = .detailOnly
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

/// A single quiet icon button for the sidebar navigation row.
private struct HubSidebarIconButton: View {
    let systemImage: String
    let accessibilityLabel: String
    let help: String
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled
    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 13, weight: .medium))
                .frame(width: 24, height: 24)
                .background {
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .fill(isHovering && isEnabled ? Color.primary.opacity(0.09) : Color.clear)
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .opacity(isEnabled ? 1 : 0.35)
        .onHover { isHovering = $0 }
        .help(help)
        .accessibilityLabel(accessibilityLabel)
    }
}

/// Floating affordance shown over the workspace while the native sidebar is
/// collapsed, so it can be reopened without relying on a keyboard shortcut.
///
/// It sits inside the window's safe area, just below the traffic lights, and is
/// deliberately small and translucent so it reads as a utility rather than a
/// competing control over the embedded web UI.
struct HubSidebarRevealButton: View {
    let action: () -> Void

    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: "sidebar.leading")
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 26, height: 26)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.10), lineWidth: 1)
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .onHover { isHovering = $0 }
        .opacity(isHovering ? 1 : 0.9)
        .help("Show the native sidebar")
        .accessibilityLabel("Show sidebar")
    }
}
