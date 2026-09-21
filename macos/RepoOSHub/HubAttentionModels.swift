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

struct HubGlobalPreferences: Codable, Equatable, Sendable {
    var notificationsEnabled: Bool
    var dockBadgeEnabled: Bool

    static let `default` = HubGlobalPreferences(notificationsEnabled: true, dockBadgeEnabled: true)
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
