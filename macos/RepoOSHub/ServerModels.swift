import AppKit
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
    /// Trusted only for loopback servers, from their /api/health response.
    /// Lets the Hub use RepoOS's existing managed-service commands while the
    /// server itself is offline.
    var localProjectPath: String?

    var originURL: URL? {
        URL(string: originString)
    }

    /// The exact stored origin to put on the pasteboard, or nil when the
    /// registry holds no usable URL. `URL(string: "")` is non-nil, so the
    /// empty/whitespace and missing-scheme cases are checked explicitly.
    var copyableOriginString: String? {
        let trimmed = originString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              let url = URL(string: trimmed),
              let scheme = url.scheme,
              !scheme.isEmpty,
              let host = url.host,
              !host.isEmpty
        else { return nil }
        return trimmed
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
        crossServerTaskSearchEnabled: Bool = false,
        localProjectPath: String? = nil
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
        self.localProjectPath = localProjectPath
    }

    enum CodingKeys: String, CodingKey {
        case id, name, repositoryName, originString, createdAt, updatedAt, lastHealth, lastHealthAt, sortOrder
        case accentColorHex, iconSymbolName, groupName, isPinned
        case attentionAggregationEnabled, notifyReviewReady, notifyNeedsInput, notifyActiveAgents
        case crossServerTaskSearchEnabled
        case localProjectPath
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
        localProjectPath = try container.decodeIfPresent(String.self, forKey: .localProjectPath)
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
        try container.encodeIfPresent(localProjectPath, forKey: .localProjectPath)
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
        case .success(_, _, _):
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
        if case .success(_, _, _) = outcome {
            entry.lastHealthAt = checkedAt
        }
        entry.updatedAt = checkedAt
    }
}

// MARK: - Server context menu

/// Pure description of the server row's context menu, so menu contents
/// (including Copy URL) can be unit-tested without mounting SwiftUI.
enum ServerAction: Hashable {
    case notifications
    case pinTask
    case togglePin
    case copyURL(String)
    case edit
    case startLocalService
    case stopLocalService
    case restartLocalService
    case remove
}

struct ServerActionMenuItem: Identifiable, Equatable {
    let action: ServerAction
    let title: String
    let systemImage: String
    var isDestructive = false

    var id: ServerAction { action }
}

struct ServerActionMenuSection: Equatable {
    var items: [ServerActionMenuItem]
}

enum ServerActionsMenuModel {
    static func sections(for entry: ServerEntry) -> [ServerActionMenuSection] {
        var serverItems: [ServerActionMenuItem] = [
            ServerActionMenuItem(
                action: .notifications,
                title: "Notifications…",
                systemImage: "bell"
            ),
            ServerActionMenuItem(
                action: .pinTask,
                title: "Pin task…",
                systemImage: "pin"
            ),
            ServerActionMenuItem(
                action: .togglePin,
                title: entry.isPinned ? "Unpin server" : "Pin server",
                systemImage: entry.isPinned ? "pin.slash" : "pin.fill"
            ),
        ]

        // Copy the exact stored origin (scheme and port included) rather than a
        // display-formatted URL: local and remote servers both work.
        if let origin = entry.copyableOriginString {
            serverItems.append(
                ServerActionMenuItem(
                    action: .copyURL(origin),
                    title: "Copy URL",
                    systemImage: "doc.on.doc"
                )
            )
        }

        serverItems.append(
            ServerActionMenuItem(
                action: .edit,
                title: "Edit server…",
                systemImage: "pencil"
            )
        )

        var sections = [ServerActionMenuSection(items: serverItems)]

        if canManageLocalService(entry) {
            let serviceItems: [ServerActionMenuItem]
            if entry.lastHealth == .healthy {
                serviceItems = [
                    ServerActionMenuItem(
                        action: .stopLocalService,
                        title: "Stop local server",
                        systemImage: "stop.circle"
                    ),
                    ServerActionMenuItem(
                        action: .restartLocalService,
                        title: "Restart local server",
                        systemImage: "arrow.clockwise"
                    ),
                ]
            } else {
                serviceItems = [
                    ServerActionMenuItem(
                        action: .startLocalService,
                        title: "Start local server",
                        systemImage: "play.circle"
                    )
                ]
            }
            sections.append(ServerActionMenuSection(items: serviceItems))
        }

        sections.append(
            ServerActionMenuSection(items: [
                ServerActionMenuItem(
                    action: .remove,
                    title: "Remove server",
                    systemImage: "trash",
                    isDestructive: true
                )
            ])
        )
        return sections
    }

    static func canManageLocalService(_ entry: ServerEntry) -> Bool {
        entry.originURL.map(HubAccessPolicy.permitsLoopbackWithoutCapability) == true
            && entry.localProjectPath != nil
    }
}

/// Writes a copied URL to a pasteboard. Injectable so the Copy URL action can
/// be tested without touching the user's clipboard.
enum ServerClipboard {
    static func copy(_ string: String, to pasteboard: NSPasteboard = .general) {
        pasteboard.clearContents()
        pasteboard.setString(string, forType: .string)
    }
}

// MARK: - Repo color preference

/// The cross-context repo color signal (#0892).
///
/// The web UI keeps the user's per-browser repo color in a first-party cookie
/// named `repoos_repo_color` (with `localStorage` as its legacy fallback). The
/// Hub reads only this cookie from the server's isolated `WKWebsiteDataStore`;
/// it never reads the session cookie, injects scripts, or registers a bridge.
/// The value is `<repo-name>:<#RRGGBB>`, where an empty color is an explicit
/// Default choice that must clear the native sidebar bar.
enum RepoAccentColorPreference {
    static let cookieName = "repoos_repo_color"

    enum CookieValue: Equatable {
        case color(String)
        case cleared
        case unsupported
    }

    static func parseCookieValue(
        _ rawValue: String,
        expectedRepoName: String? = nil
    ) -> CookieValue {
        let decoded = rawValue.removingPercentEncoding ?? rawValue
        let trimmed = decoded.trimmingCharacters(in: .whitespacesAndNewlines)
        let repoPart: String
        let colorPart: String
        if let separator = trimmed.lastIndex(of: ":") {
            repoPart = String(trimmed[..<separator])
            colorPart = String(trimmed[trimmed.index(after: separator)...])
        } else {
            repoPart = ""
            colorPart = trimmed
        }

        // The web UI scopes the cookie to the repo name it was chosen for.
        // A server later serving a different repo must not inherit the color;
        // an unknown/legacy value has no repo part and stays accepted.
        if let expectedRepoName,
           !expectedRepoName.isEmpty,
           !repoPart.isEmpty,
           repoPart.caseInsensitiveCompare(expectedRepoName) != .orderedSame
        {
            return .unsupported
        }

        if let normalized = ServerAccentColor.normalizedHex(colorPart) {
            return .color(normalized)
        }
        if colorPart.isEmpty || colorPart.caseInsensitiveCompare("none") == .orderedSame {
            return .cleared
        }
        return .unsupported
    }
}
