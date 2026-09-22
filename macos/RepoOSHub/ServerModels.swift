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
    var repositoryName: String?
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
    var attentionAggregationEnabled: Bool
    var notifyReviewReady: Bool
    var notifyNeedsInput: Bool
    var notifyActiveAgents: Bool
    var crossServerTaskSearchEnabled: Bool

    var originURL: URL? {
        URL(string: originString)
    }

    init(
        id: UUID = UUID(),
        name: String,
        repositoryName: String? = nil,
        origin: URL,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        lastHealth: HealthState = .unknown,
        lastHealthAt: Date? = nil,
        sortOrder: Int = 0,
        accentColorHex: String? = nil,
        iconSymbolName: String? = nil,
        groupName: String? = nil,
        isPinned: Bool = false,
        attentionAggregationEnabled: Bool = true,
        notifyReviewReady: Bool = true,
        notifyNeedsInput: Bool = true,
        notifyActiveAgents: Bool = false,
        crossServerTaskSearchEnabled: Bool = false
    ) {
        self.id = id
        self.name = name
        self.repositoryName = repositoryName
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
        self.attentionAggregationEnabled = attentionAggregationEnabled
        self.notifyReviewReady = notifyReviewReady
        self.notifyNeedsInput = notifyNeedsInput
        self.notifyActiveAgents = notifyActiveAgents
        self.crossServerTaskSearchEnabled = crossServerTaskSearchEnabled
    }

    enum CodingKeys: String, CodingKey {
        case id, name, repositoryName, originString, createdAt, updatedAt, lastHealth, lastHealthAt, sortOrder
        case accentColorHex, iconSymbolName, groupName, isPinned
        case attentionAggregationEnabled, notifyReviewReady, notifyNeedsInput, notifyActiveAgents
        case crossServerTaskSearchEnabled
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        repositoryName = try container.decodeIfPresent(String.self, forKey: .repositoryName)
        originString = try container.decode(String.self, forKey: .originString)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        lastHealth = try container.decode(HealthState.self, forKey: .lastHealth)
        lastHealthAt = try container.decodeIfPresent(Date.self, forKey: .lastHealthAt)
        sortOrder = try container.decode(Int.self, forKey: .sortOrder)
        accentColorHex = try container.decodeIfPresent(String.self, forKey: .accentColorHex)
        iconSymbolName = try container.decodeIfPresent(String.self, forKey: .iconSymbolName)
        groupName = try container.decodeIfPresent(String.self, forKey: .groupName)
        isPinned = try container.decodeIfPresent(Bool.self, forKey: .isPinned) ?? false
        attentionAggregationEnabled = try container.decodeIfPresent(Bool.self, forKey: .attentionAggregationEnabled) ?? true
        notifyReviewReady = try container.decodeIfPresent(Bool.self, forKey: .notifyReviewReady) ?? true
        notifyNeedsInput = try container.decodeIfPresent(Bool.self, forKey: .notifyNeedsInput) ?? true
        notifyActiveAgents = try container.decodeIfPresent(Bool.self, forKey: .notifyActiveAgents) ?? false
        crossServerTaskSearchEnabled = try container.decodeIfPresent(Bool.self, forKey: .crossServerTaskSearchEnabled) ?? false
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(originString, forKey: .originString)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
        try container.encode(lastHealth, forKey: .lastHealth)
        try container.encodeIfPresent(lastHealthAt, forKey: .lastHealthAt)
        try container.encode(sortOrder, forKey: .sortOrder)
        try container.encodeIfPresent(accentColorHex, forKey: .accentColorHex)
        try container.encodeIfPresent(iconSymbolName, forKey: .iconSymbolName)
        try container.encodeIfPresent(groupName, forKey: .groupName)
        try container.encode(isPinned, forKey: .isPinned)
        try container.encode(attentionAggregationEnabled, forKey: .attentionAggregationEnabled)
        try container.encode(notifyReviewReady, forKey: .notifyReviewReady)
        try container.encode(notifyNeedsInput, forKey: .notifyNeedsInput)
        try container.encode(notifyActiveAgents, forKey: .notifyActiveAgents)
        try container.encode(crossServerTaskSearchEnabled, forKey: .crossServerTaskSearchEnabled)
    }
}

struct ServerRegistryDocument: Codable, Equatable, Sendable {
    static let currentVersion = 2

    var version: Int
    var entries: [ServerEntry]
    var lastSelectedServerID: UUID?
    var serverRecents: [ServerRecentMetadata]
    var pinnedTaskContexts: [PinnedTaskContext]
    var hubGlobalPreferences: HubGlobalPreferences

    init(
        entries: [ServerEntry] = [],
        lastSelectedServerID: UUID? = nil,
        serverRecents: [ServerRecentMetadata] = [],
        pinnedTaskContexts: [PinnedTaskContext] = [],
        hubGlobalPreferences: HubGlobalPreferences = .default
    ) {
        self.version = Self.currentVersion
        self.entries = entries
        self.lastSelectedServerID = lastSelectedServerID
        self.serverRecents = serverRecents
        self.pinnedTaskContexts = pinnedTaskContexts
        self.hubGlobalPreferences = hubGlobalPreferences
    }

    enum CodingKeys: String, CodingKey {
        case version
        case entries
        case lastSelectedServerID
        case serverRecents
        case pinnedTaskContexts
        case hubGlobalPreferences
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decode(Int.self, forKey: .version)
        guard version == 1 || version == 2 else {
            throw DecodingError.dataCorruptedError(forKey: .version, in: container, debugDescription: "Unsupported registry version")
        }
        entries = try container.decode([ServerEntry].self, forKey: .entries)
        lastSelectedServerID = try container.decodeIfPresent(UUID.self, forKey: .lastSelectedServerID)
        serverRecents = try container.decodeIfPresent([ServerRecentMetadata].self, forKey: .serverRecents) ?? []
        pinnedTaskContexts = try container.decodeIfPresent([PinnedTaskContext].self, forKey: .pinnedTaskContexts) ?? []
        hubGlobalPreferences = try container.decodeIfPresent(HubGlobalPreferences.self, forKey: .hubGlobalPreferences) ?? .default
        if version < ServerRegistryDocument.currentVersion {
            self.version = ServerRegistryDocument.currentVersion
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(ServerRegistryDocument.currentVersion, forKey: .version)
        try container.encode(entries, forKey: .entries)
        try container.encodeIfPresent(lastSelectedServerID, forKey: .lastSelectedServerID)
        try container.encode(serverRecents, forKey: .serverRecents)
        try container.encode(pinnedTaskContexts, forKey: .pinnedTaskContexts)
        try container.encode(hubGlobalPreferences, forKey: .hubGlobalPreferences)
    }
}

enum ReachabilityTransition {
    static func healthState(after outcome: HealthCheckOutcome, previous: HealthState) -> HealthState {
        switch outcome {
        case .success(_):
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
        if case .success(_) = outcome {
            entry.lastHealthAt = checkedAt
        }
        entry.updatedAt = checkedAt
    }
}
