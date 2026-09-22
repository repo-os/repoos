import Foundation

/// A locally stored route hint for a server workspace (not a cached task record).
struct ServerContextRoute: Codable, Equatable, Sendable, Identifiable {
    var id: UUID
    var path: String
    var title: String?
    var lastVisitedAt: Date

    init(id: UUID = UUID(), path: String, title: String? = nil, lastVisitedAt: Date = Date()) {
        self.id = id
        self.path = path
        self.title = title
        self.lastVisitedAt = lastVisitedAt
    }
}

/// Optional pinned task context — created only by explicit user action, never from passive visits.
struct PinnedTaskContext: Codable, Equatable, Sendable, Identifiable {
    var id: UUID
    var serverID: UUID
    var taskIdentifier: String
    var routePath: String
    var label: String
    var pinnedAt: Date

    init(
        id: UUID = UUID(),
        serverID: UUID,
        taskIdentifier: String,
        routePath: String,
        label: String,
        pinnedAt: Date = Date()
    ) {
        self.id = id
        self.serverID = serverID
        self.taskIdentifier = taskIdentifier
        self.routePath = routePath
        self.label = label
        self.pinnedAt = pinnedAt
    }
}

struct ServerRecentMetadata: Codable, Equatable, Sendable {
    var serverID: UUID
    var recentRoutes: [ServerContextRoute]
    var lastRoutePath: String?

    init(serverID: UUID, recentRoutes: [ServerContextRoute] = [], lastRoutePath: String? = nil) {
        self.serverID = serverID
        self.recentRoutes = recentRoutes
        self.lastRoutePath = lastRoutePath
    }
}

enum HubRecentsRetention {
    /// Bounded MRU list per server — visiting a route never creates a permanent tab.
    static let maxRecentRoutesPerServer = 8

    static func recordVisit(
        path rawPath: String,
        title: String?,
        visitedAt: Date,
        metadata: ServerRecentMetadata
    ) -> ServerRecentMetadata {
        let path = normalizeRoutePath(rawPath)
        guard !path.isEmpty else { return metadata }

        var routes = metadata.recentRoutes.filter { normalizeRoutePath($0.path) != path }
        routes.insert(
            ServerContextRoute(path: path, title: trimmedTitle(title), lastVisitedAt: visitedAt),
            at: 0
        )
        if routes.count > maxRecentRoutesPerServer {
            routes = Array(routes.prefix(maxRecentRoutesPerServer))
        }
        return ServerRecentMetadata(
            serverID: metadata.serverID,
            recentRoutes: routes,
            lastRoutePath: path
        )
    }

    static func prune(metadata: [ServerRecentMetadata], validServerIDs: Set<UUID>) -> [ServerRecentMetadata] {
        metadata.filter { validServerIDs.contains($0.serverID) }
    }

    static func prune(pinned: [PinnedTaskContext], validServerIDs: Set<UUID>) -> [PinnedTaskContext] {
        pinned.filter { validServerIDs.contains($0.serverID) }
    }

    static func normalizeRoutePath(_ path: String) -> String {
        var trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "" }
        if !trimmed.hasPrefix("/") { trimmed = "/\(trimmed)" }
        while trimmed.count > 1, trimmed.hasSuffix("/") {
            trimmed.removeLast()
        }
        return trimmed
    }

    private static func trimmedTitle(_ title: String?) -> String? {
        guard let title else { return nil }
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

struct WorkspaceNavigationSnapshot: Equatable {
    var hasEmbeddedWebContent: Bool
    var webCanGoBack: Bool
    var webCanGoForward: Bool
    var webIsLoading: Bool

    static let placeholder = WorkspaceNavigationSnapshot(
        hasEmbeddedWebContent: false,
        webCanGoBack: false,
        webCanGoForward: false,
        webIsLoading: false
    )

    var shellOwnsBackForward: Bool {
        !hasEmbeddedWebContent || (!webCanGoBack && !webCanGoForward)
    }

    var canGoBack: Bool {
        hasEmbeddedWebContent && webCanGoBack
    }

    var canGoForward: Bool {
        hasEmbeddedWebContent && webCanGoForward
    }

    var canReload: Bool {
        true
    }
}

struct HubNavigationRequest: Equatable, Identifiable {
    let id = UUID()
    let serverID: UUID
    let path: String
}

enum CommandPaletteAction: Equatable {
    case selectServer(UUID)
    case openRecent(serverID: UUID, path: String)
    case openPinned(PinnedTaskContext)
    case addServer
}

struct CommandPaletteItem: Equatable, Identifiable {
    enum Kind: Equatable {
        case server
        case recent
        case pinned
        case action
    }

    let id: String
    let title: String
    let subtitle: String?
    let kind: Kind
    let action: CommandPaletteAction
    let score: Int
}

enum CommandPaletteMatcher {
    static func buildItems(
        query: String,
        entries: [ServerEntry],
        recents: [ServerRecentMetadata],
        pinnedContexts: [PinnedTaskContext],
        includeAddServer: Bool = true
    ) -> [CommandPaletteItem] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let tokens = tokenize(trimmed)
        var items: [CommandPaletteItem] = []

        for entry in entries.sorted(by: sidebarOrder) {
            let subtitle = entry.originString
            let score = scoreMatch(
                tokens: tokens,
                title: entry.name,
                subtitle: subtitle,
                extra: [entry.groupName ?? ""]
            )
            if tokens.isEmpty || score > 0 {
                items.append(
                    CommandPaletteItem(
                        id: "server-\(entry.id.uuidString)",
                        title: entry.name,
                        subtitle: subtitle,
                        kind: .server,
                        action: .selectServer(entry.id),
                        score: tokens.isEmpty ? 1000 - entry.sortOrder : score
                    )
                )
            }
        }

        let entryByID = Dictionary(uniqueKeysWithValues: entries.map { ($0.id, $0) })
        for meta in recents {
            guard let entry = entryByID[meta.serverID] else { continue }
            for route in meta.recentRoutes.sorted(by: { $0.lastVisitedAt > $1.lastVisitedAt }) {
                let title = route.title ?? route.path
                let subtitle = "\(entry.name) · recent"
                let score = scoreMatch(
                    tokens: tokens,
                    title: title,
                    subtitle: subtitle,
                    extra: [entry.name, entry.originString, route.path]
                )
                if tokens.isEmpty || score > 0 {
                    items.append(
                        CommandPaletteItem(
                            id: "recent-\(meta.serverID.uuidString)-\(route.id.uuidString)",
                            title: title,
                            subtitle: subtitle,
                            kind: .recent,
                            action: .openRecent(serverID: meta.serverID, path: route.path),
                            score: tokens.isEmpty ? 500 : score
                        )
                    )
                }
            }
        }

        for pin in pinnedContexts.sorted(by: { $0.pinnedAt > $1.pinnedAt }) {
            guard let entry = entryByID[pin.serverID] else { continue }
            let subtitle = "\(entry.name) · #\(pin.taskIdentifier)"
            let score = scoreMatch(
                tokens: tokens,
                title: pin.label,
                subtitle: subtitle,
                extra: [pin.taskIdentifier, pin.routePath, entry.name, entry.originString]
            )
            if tokens.isEmpty || score > 0 {
                items.append(
                    CommandPaletteItem(
                        id: "pin-\(pin.id.uuidString)",
                        title: pin.label,
                        subtitle: subtitle,
                        kind: .pinned,
                        action: .openPinned(pin),
                        score: tokens.isEmpty ? 800 : score + 20
                    )
                )
            }
        }

        if includeAddServer {
            let addScore = scoreMatch(tokens: tokens, title: "Add server", subtitle: "Register a RepoOS server", extra: [])
            if tokens.isEmpty || addScore > 0 {
                items.append(
                    CommandPaletteItem(
                        id: "action-add-server",
                        title: "Add server…",
                        subtitle: "Register a new RepoOS server",
                        kind: .action,
                        action: .addServer,
                        score: tokens.isEmpty ? 100 : addScore + 50
                    )
                )
            }
        }

        return items.sorted { lhs, rhs in
            if lhs.score != rhs.score { return lhs.score > rhs.score }
            return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
        }
    }

    private static func sidebarOrder(_ lhs: ServerEntry, _ rhs: ServerEntry) -> Bool {
        if lhs.isPinned != rhs.isPinned { return lhs.isPinned && !rhs.isPinned }
        if lhs.sortOrder != rhs.sortOrder { return lhs.sortOrder < rhs.sortOrder }
        return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
    }

    private static func tokenize(_ query: String) -> [String] {
        query
            .split(whereSeparator: { $0.isWhitespace })
            .map { String($0).lowercased() }
            .filter { !$0.isEmpty }
    }

    private static func scoreMatch(tokens: [String], title: String, subtitle: String?, extra: [String]) -> Int {
        guard !tokens.isEmpty else { return 1 }
        let haystack = ([title, subtitle ?? ""] + extra)
            .joined(separator: " ")
            .lowercased()
        var score = 0
        for token in tokens where haystack.contains(token) {
            score += 10
            if title.lowercased().hasPrefix(token) { score += 8 }
            if title.lowercased().contains(token) { score += 4 }
        }
        return score
    }
}

extension Notification.Name {
    static let hubWebNavigationBack = Notification.Name("org.repoos.hub.webNavigation.back")
    static let hubWebNavigationForward = Notification.Name("org.repoos.hub.webNavigation.forward")
    static let hubWebNavigationReload = Notification.Name("org.repoos.hub.webNavigation.reload")
    static let hubWebNavigationNavigate = Notification.Name("org.repoos.hub.webNavigation.navigate")
}

enum HubWebNavigationCommand {
    static let serverIDKey = "serverID"
    static let pathKey = "path"

    static func userInfo(serverID: UUID, path: String? = nil) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = [serverIDKey: serverID.uuidString]
        if let path {
            info[pathKey] = path
        }
        return info
    }

    static func targets(_ notification: Notification, serverID: UUID) -> Bool {
        notification.userInfo?[serverIDKey] as? String == serverID.uuidString
    }
}
