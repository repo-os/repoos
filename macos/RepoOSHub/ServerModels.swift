import Foundation

enum HealthState: String, Codable, Equatable, Sendable {
    case unknown
    case healthy
    case unreachable
    case invalid

    var displayTitle: String {
        switch self {
        case .unknown: return "Not checked"
        case .healthy: return "Healthy"
        case .unreachable: return "Offline"
        case .invalid: return "Invalid response"
        }
    }
}

struct ServerEntry: Identifiable, Codable, Equatable, Sendable {
    var id: UUID
    var name: String
    var originString: String
    var createdAt: Date
    var updatedAt: Date
    var lastHealth: HealthState
    var lastHealthAt: Date?
    var sortOrder: Int
    var accentColorHex: String?
    var iconSymbolName: String?
    var groupName: String?
    var isPinned: Bool

    var originURL: URL? {
        URL(string: originString)
    }

    init(
        id: UUID = UUID(),
        name: String,
        origin: URL,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        lastHealth: HealthState = .unknown,
        lastHealthAt: Date? = nil,
        sortOrder: Int = 0,
        accentColorHex: String? = nil,
        iconSymbolName: String? = nil,
        groupName: String? = nil,
        isPinned: Bool = false
    ) {
        self.id = id
        self.name = name
        self.originString = origin.absoluteString
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.lastHealth = lastHealth
        self.lastHealthAt = lastHealthAt
        self.sortOrder = sortOrder
        self.accentColorHex = accentColorHex
        self.iconSymbolName = iconSymbolName
        self.groupName = groupName
        self.isPinned = isPinned
    }
}

struct ServerRegistryDocument: Codable, Equatable, Sendable {
    static let currentVersion = 1

    var version: Int
    var entries: [ServerEntry]
    var lastSelectedServerID: UUID?

    init(entries: [ServerEntry] = [], lastSelectedServerID: UUID? = nil) {
        self.version = Self.currentVersion
        self.entries = entries
        self.lastSelectedServerID = lastSelectedServerID
    }
}

enum ReachabilityTransition {
    static func healthState(after outcome: HealthCheckOutcome, previous: HealthState) -> HealthState {
        switch outcome {
        case .success:
            return .healthy
        case .failure(let failure):
            switch failure {
            case .invalidJSON, .notRepoOS:
                return .invalid
            case .redirect, .httpStatus, .timeout, .tls, .network:
                _ = previous
                return .unreachable
            }
        }
    }

    static func applyHealthCheck(to entry: inout ServerEntry, outcome: HealthCheckOutcome, checkedAt: Date = Date()) {
        entry.lastHealth = healthState(after: outcome, previous: entry.lastHealth)
        if case .success = outcome {
            entry.lastHealthAt = checkedAt
        }
        entry.updatedAt = checkedAt
    }
}
