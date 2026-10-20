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

/// Fixed geometry and labelling for the collapsed-sidebar reveal tab.
///
/// The tab is deliberately narrow (22–26 pt) and rounded on its trailing edge
/// only so it can sit flush against the window edge (#0857).
enum HubSidebarRevealTabMetrics {
    static let width: CGFloat = 24
    static let height: CGFloat = 32
    static let cornerRadius: CGFloat = 6
    static let systemImage = "chevron.right"
    static let accessibilityLabel = "Show Sidebar"
}

/// Edge-attached tab shown over the workspace while the native sidebar is
/// collapsed, so it can be reopened without relying on a keyboard shortcut.
///
/// It hugs the window's leading edge inside the safe area, just below the
/// native traffic lights, and stays quiet: a small chevron, a subtle translucent
/// fill, and a hover state only, so it never competes with the embedded web UI
/// (#0857).
struct HubSidebarRevealTab: View {
    let action: () -> Void

    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: HubSidebarRevealTabMetrics.systemImage)
                .font(.system(size: 10, weight: .semibold))
                .frame(
                    width: HubSidebarRevealTabMetrics.width,
                    height: HubSidebarRevealTabMetrics.height
                )
                .background {
                    HubSidebarRevealTabShape(cornerRadius: HubSidebarRevealTabMetrics.cornerRadius)
                        .fill(Color.primary.opacity(isHovering ? 0.16 : 0.08))
                }
                .contentShape(
                    HubSidebarRevealTabShape(cornerRadius: HubSidebarRevealTabMetrics.cornerRadius)
                )
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .onHover { isHovering = $0 }
        .help("Show the native sidebar")
        .accessibilityLabel(HubSidebarRevealTabMetrics.accessibilityLabel)
    }
}

/// A tab silhouette rounded on its trailing edge only. The leading edge stays
/// square so the control sits flush against the window's left edge.
struct HubSidebarRevealTabShape: Shape {
    var cornerRadius: CGFloat

    func path(in rect: CGRect) -> Path {
        let radius = min(cornerRadius, rect.width / 2, rect.height / 2)
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.minY + radius),
            control: CGPoint(x: rect.maxX, y: rect.minY)
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX - radius, y: rect.maxY),
            control: CGPoint(x: rect.maxX, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}
