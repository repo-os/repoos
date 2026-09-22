import Foundation

/// LRU working set for live per-server `WKWebView` instances in the macOS Hub.
///
/// Servers inside the set switch instantly because their web view stays mounted.
/// Evicted servers reload on return; cookies and storage persist on disk via the
/// per-identifier `WKWebsiteDataStore`, and route intent restores from `lastRoutePath`.
enum HubWorkspaceWebViewResidency {
    /// Inactive workspaces kept alive in addition to the selected server.
    static let maxInactiveWorkspaceWebViews = 4

    /// Default live WebView count: one active workspace plus the inactive budget.
    static let maxLiveWorkspaceWebViews = 1 + maxInactiveWorkspaceWebViews

    static let memoryPressureWarnInactiveWorkspaceWebViews = 2
    static let memoryPressureCriticalInactiveWorkspaceWebViews = 0

    enum MemoryPressureLevel: Equatable {
        case warning
        case critical
    }

    static func maxInactive(for pressure: MemoryPressureLevel?) -> Int {
        switch pressure {
        case nil:
            return maxInactiveWorkspaceWebViews
        case .warning:
            return memoryPressureWarnInactiveWorkspaceWebViews
        case .critical:
            return memoryPressureCriticalInactiveWorkspaceWebViews
        }
    }

    /// Moves `serverID` to the front of the list (most recently used first).
    static func touch(serverID: UUID, in lruOrder: [UUID]) -> [UUID] {
        [serverID] + lruOrder.filter { $0 != serverID }
    }

    /// Applies the inactive budget. The active workspace is never evicted.
    static func applyingBudget(
        retained: Set<UUID>,
        lruOrder: [UUID],
        activeServerID: UUID?,
        maxInactive: Int
    ) -> (retained: Set<UUID>, evicted: Set<UUID>) {
        var kept = Set<UUID>()
        if let activeServerID {
            kept.insert(activeServerID)
        }
        if maxInactive > 0 {
            let inactiveCandidates = lruOrder.filter { $0 != activeServerID && retained.contains($0) }
            for id in inactiveCandidates.prefix(maxInactive) {
                kept.insert(id)
            }
        }
        let evicted = retained.subtracting(kept)
        return (kept, evicted)
    }
}
