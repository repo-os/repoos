import SwiftUI

/// Layout decisions shared by the workspace chrome and the embedded page.
///
/// The Hub window has no native toolbar row: the transparent titlebar band is
/// content space (#0855). In Tabs mode the server tab strip owns that band and
/// the embedded page must stay below its full height; in Sidebar mode the page
/// reclaims the band up to the window's top edge (#0895).
enum HubWorkspaceLayout {
    static func usesTabStrip(_ layout: HubServerNavigationLayout) -> Bool {
        layout == .tabs
    }

    /// Whether the embedded page may draw under the window's top safe area.
    /// Only in Sidebar mode: in Tabs mode the strip owns that space and the
    /// page's top row must stay visible below it.
    static func pageExtendsUnderTitleBar(_ layout: HubServerNavigationLayout) -> Bool {
        !usesTabStrip(layout)
    }

    /// Top space the tab strip reserves above the page in Tabs mode.
    static func contentTopInset(_ layout: HubServerNavigationLayout) -> CGFloat {
        usesTabStrip(layout) ? HubServerTabStripMetrics.height : 0
    }
}

/// Adds the window's top chrome above the workspace detail: the server tab
/// strip in Tabs mode, nothing in Sidebar mode.
///
/// `safeAreaInset` (rather than top padding) makes the strip a real layout row,
/// so the page's top edge cannot drift under it. The outer `ignoresSafeArea`
/// lets that row start at the window's top edge inside the transparent
/// titlebar band. The page's own top-safe-area handling must agree with
/// `HubWorkspaceLayout`: `ServerWebWorkspaceView` only ignores the top safe
/// area in Sidebar mode, because a child-level ignore would otherwise pull the
/// page back under the strip (#0895).
struct HubWorkspaceChrome<Content: View>: View {
    let layout: HubServerNavigationLayout
    @ViewBuilder var content: Content

    var body: some View {
        content
            .safeAreaInset(edge: .top, spacing: 0) {
                if HubWorkspaceLayout.usesTabStrip(layout) {
                    HubServerTabStrip()
                        .frame(height: HubWorkspaceLayout.contentTopInset(layout))
                }
            }
            .ignoresSafeArea(edges: HubWorkspaceLayout.usesTabStrip(layout) ? .top : [])
    }
}
