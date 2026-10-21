import Foundation

struct HubAttentionCounts: Equatable, Sendable {
    var activeAgents: Int
    var reviewReadyTasks: Int
    var needsInputTasks: Int

    var attentionTotal: Int {
        max(0, reviewReadyTasks) + max(0, needsInputTasks)
    }
}

struct HubSummaryPayload: Equatable, Sendable {
    var apiVersion: String
    var generatedAt: Date
    var lastActivityAt: Date?
    var attention: HubAttentionCounts
}

enum HubSummaryFetchFailure: Error, Equatable, Sendable {
    case missingCapability
    case unauthorized
    case rateLimited(retryAfter: TimeInterval?)
    case transport(String)
    case invalidResponse
}

enum SummaryFreshness: Equatable, Sendable {
    case unavailable
    case stale
    case fresh

    var displayTitle: String {
        switch self {
        case .unavailable: return "Summary unavailable"
        case .stale: return "Summary stale"
        case .fresh: return "Summary fresh"
        }
    }
}

struct ServerAttentionSnapshot: Equatable, Sendable {
    var serverID: UUID
    var freshness: SummaryFreshness
    var counts: HubAttentionCounts?
    var fetchedAt: Date?
    var lastError: HubSummaryFetchFailure?
    var hasCapability: Bool

    static func unavailable(serverID: UUID, hasCapability: Bool) -> ServerAttentionSnapshot {
        ServerAttentionSnapshot(
            serverID: serverID,
            freshness: .unavailable,
            counts: nil,
            fetchedAt: nil,
            lastError: hasCapability ? nil : .missingCapability,
            hasCapability: hasCapability
        )
    }
}

enum HubAttentionNotificationKind: String, Equatable, Sendable {
    case reviewReady
    case needsInput
    case activeAgents
}

struct HubAttentionNotificationEvent: Equatable, Sendable {
    var serverID: UUID
    var serverName: String
    var kind: HubAttentionNotificationKind
    var count: Int
    var routePath: String
}

/// Application-level server navigation. Sidebar is the historical default.
enum HubServerNavigationLayout: String, Codable, CaseIterable, Sendable {
    case sidebar
    case tabs

    var displayName: String {
        switch self {
        case .sidebar: return "Sidebar"
        case .tabs: return "Tabs"
        }
    }
}

/// Pure tab-strip ordering. Visible tabs are servers, never pages. Hiding a
/// tab records an id; it does not remove the server entry.
enum HubServerTabOrder {
    static func visibleServerIDs(
        entries: [ServerEntry],
        preferredOrder: [UUID],
        hiddenIDs: [UUID]
    ) -> [UUID] {
        let hidden = Set(hiddenIDs)
        let byID = Dictionary(uniqueKeysWithValues: entries.map { ($0.id, $0) })
        var seen = Set<UUID>()
        var result: [UUID] = []
        for id in preferredOrder {
            guard byID[id] != nil, !hidden.contains(id), seen.insert(id).inserted else { continue }
            result.append(id)
        }
        for entry in entries.sorted(by: { $0.sortOrder < $1.sortOrder }) {
            guard !hidden.contains(entry.id), seen.insert(entry.id).inserted else { continue }
            result.append(entry.id)
        }
        return result
    }

    /// Drops `source` at `target`. Moving right inserts after the target so an
    /// adjacent move actually changes order; moving left inserts before it.
    static func move(
        entries: [ServerEntry],
        preferredOrder: [UUID],
        hiddenIDs: [UUID],
        source: UUID,
        to target: UUID
    ) -> [UUID] {
        var ids = visibleServerIDs(entries: entries, preferredOrder: preferredOrder, hiddenIDs: hiddenIDs)
        guard source != target,
              let from = ids.firstIndex(of: source),
              let targetIndex = ids.firstIndex(of: target)
        else { return ids }
        let movingRight = from < targetIndex
        let item = ids.remove(at: from)
        let destination = ids.firstIndex(of: target) ?? ids.endIndex
        let insertAt = movingRight ? min(destination + 1, ids.count) : destination
        ids.insert(item, at: insertAt)
        return ids
    }

    static func adjacent(visible: [UUID], selected: UUID?, forward: Bool) -> UUID? {
        guard !visible.isEmpty else { return nil }
        guard let selected, let index = visible.firstIndex(of: selected) else { return visible[0] }
        let step = forward ? 1 : -1
        let next = (index + step + visible.count) % visible.count
        return visible[next]
    }
}

struct HubGlobalPreferences: Codable, Equatable, Sendable {
    var notificationsEnabled: Bool
    var dockBadgeEnabled: Bool
    var appearance: HubAppAppearance
    var navigationLayout: HubServerNavigationLayout
    /// Persisted visible-tab order. Servers missing from this list append in sidebar sort order.
    var serverTabOrder: [UUID]
    /// Servers hidden from the tab strip. Closing a tab only adds an id here.
    var hiddenServerTabIDs: [UUID]

    init(
        notificationsEnabled: Bool,
        dockBadgeEnabled: Bool,
        appearance: HubAppAppearance = .system,
        navigationLayout: HubServerNavigationLayout = .sidebar,
        serverTabOrder: [UUID] = [],
        hiddenServerTabIDs: [UUID] = []
    ) {
        self.notificationsEnabled = notificationsEnabled
        self.dockBadgeEnabled = dockBadgeEnabled
        self.appearance = appearance
        self.navigationLayout = navigationLayout
        self.serverTabOrder = serverTabOrder
        self.hiddenServerTabIDs = hiddenServerTabIDs
    }

    static let `default` = HubGlobalPreferences(notificationsEnabled: true, dockBadgeEnabled: true, appearance: .system)

    enum CodingKeys: String, CodingKey {
        case notificationsEnabled
        case dockBadgeEnabled
        case appearance
        case navigationLayout
        case serverTabOrder
        case hiddenServerTabIDs
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        notificationsEnabled = try container.decodeIfPresent(Bool.self, forKey: .notificationsEnabled) ?? true
        dockBadgeEnabled = try container.decodeIfPresent(Bool.self, forKey: .dockBadgeEnabled) ?? true
        // An unrecognised raw value (e.g. written by a future build) must not
        // throw: that would wipe the whole registry in reloadFromDisk's catch.
        appearance = (try? container.decodeIfPresent(HubAppAppearance.self, forKey: .appearance)) ?? .system
        if let raw = try container.decodeIfPresent(String.self, forKey: .navigationLayout),
           let layout = HubServerNavigationLayout(rawValue: raw) {
            navigationLayout = layout
        } else {
            navigationLayout = .sidebar
        }
        serverTabOrder = try container.decodeIfPresent([UUID].self, forKey: .serverTabOrder) ?? []
        hiddenServerTabIDs = try container.decodeIfPresent([UUID].self, forKey: .hiddenServerTabIDs) ?? []
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(notificationsEnabled, forKey: .notificationsEnabled)
        try container.encode(dockBadgeEnabled, forKey: .dockBadgeEnabled)
        try container.encode(appearance, forKey: .appearance)
        try container.encode(navigationLayout, forKey: .navigationLayout)
        try container.encode(serverTabOrder, forKey: .serverTabOrder)
        try container.encode(hiddenServerTabIDs, forKey: .hiddenServerTabIDs)
    }
}

enum HubAttentionFreshness {
    static let selectedFreshInterval: TimeInterval = 90
    static let backgroundFreshInterval: TimeInterval = 360

    static func classify(
        fetchedAt: Date?,
        lastError: HubSummaryFetchFailure?,
        hasCapability: Bool,
        isSelected: Bool,
        now: Date
    ) -> SummaryFreshness {
        guard hasCapability else { return .unavailable }
        if let lastError {
            switch lastError {
            case .missingCapability, .unauthorized:
                return .unavailable
            case .rateLimited, .transport, .invalidResponse:
                break
            }
        }
        guard let fetchedAt else { return .unavailable }
        let threshold = isSelected ? selectedFreshInterval : backgroundFreshInterval
        if now.timeIntervalSince(fetchedAt) <= threshold {
            return .fresh
        }
        return .stale
    }
}
