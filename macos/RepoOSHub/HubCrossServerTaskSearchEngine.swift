import Foundation

@MainActor
final class HubCrossServerTaskSearchEngine: ObservableObject {
    @Published private(set) var remoteResults: [HubRemoteTaskSearchResult] = []
    @Published private(set) var serverLines: [HubRemoteTaskSearchServerLine] = []
    @Published private(set) var isSearching = false

    private let client: HubTaskSearchFetching
    private let keychain: HubCapabilityStoring
    private var entries: [ServerEntry] = []
    private var debounceTask: Task<Void, Never>?
    private var inFlightSearch: Task<Void, Never>?

    init(
        client: HubTaskSearchFetching = HubTaskSearchClient(),
        keychain: HubCapabilityStoring = HubCapabilityKeychainStore.shared
    ) {
        self.client = client
        self.keychain = keychain
    }

    func configure(entries: [ServerEntry]) {
        self.entries = entries
        if debounceTask == nil && inFlightSearch == nil {
            remoteResults = []
            serverLines = []
        }
    }

    func scheduleSearch(query rawQuery: String) {
        debounceTask?.cancel()
        inFlightSearch?.cancel()
        let trimmed = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= HubCrossServerTaskSearchPolicy.minQueryLength else {
            remoteResults = []
            serverLines = []
            isSearching = false
            return
        }

        let eligible = HubCrossServerTaskSearchPolicy.eligibleEntries(from: entries)
        serverLines = eligible.map {
            HubRemoteTaskSearchServerLine(serverID: $0.id, serverName: $0.name, status: .searching)
        }
        isSearching = !eligible.isEmpty

        debounceTask = Task {
            try? await Task.sleep(nanoseconds: HubCrossServerTaskSearchPolicy.debounceNanoseconds)
            guard !Task.isCancelled else { return }
            await runSearch(query: trimmed, eligible: eligible)
        }
    }

    func cancel() {
        debounceTask?.cancel()
        inFlightSearch?.cancel()
        debounceTask = nil
        inFlightSearch = nil
        isSearching = false
    }

    private func runSearch(query: String, eligible: [ServerEntry]) async {
        inFlightSearch?.cancel()
        let task = Task {
            var merged: [HubRemoteTaskSearchResult] = []
            var lines: [HubRemoteTaskSearchServerLine] = []

            await withTaskGroup(of: (UUID, HubRemoteTaskSearchServerLine, [HubRemoteTaskSearchResult]).self) { group in
                for entry in eligible {
                    group.addTask {
                        await self.searchOne(entry: entry, query: query)
                    }
                }
                for await (_, line, hits) in group {
                    lines.append(line)
                    merged.append(contentsOf: hits)
                }
            }

            guard !Task.isCancelled else { return }
            self.serverLines = lines.sorted {
                $0.serverName.localizedCaseInsensitiveCompare($1.serverName) == .orderedAscending
            }
            self.remoteResults = HubCrossServerTaskSearchPolicy.mergeResults(merged)
            self.isSearching = false
        }
        inFlightSearch = task
        await task.value
    }

    private func searchOne(entry: ServerEntry, query: String) async -> (UUID, HubRemoteTaskSearchServerLine, [HubRemoteTaskSearchResult]) {
        if entry.lastHealth == .unreachable {
            return (
                entry.id,
                HubRemoteTaskSearchServerLine(serverID: entry.id, serverName: entry.name, status: .offline),
                []
            )
        }
        guard let origin = entry.originURL else {
            return (
                entry.id,
                HubRemoteTaskSearchServerLine(serverID: entry.id, serverName: entry.name, status: .failed("Invalid origin")),
                []
            )
        }
        guard let token = keychain.loadToken(serverID: entry.id, origin: entry.originString) else {
            return (
                entry.id,
                HubRemoteTaskSearchServerLine(serverID: entry.id, serverName: entry.name, status: .missingCapability),
                []
            )
        }

        let outcome = await client.searchTasks(origin: origin, token: token, query: query)
        if Task.isCancelled {
            return (
                entry.id,
                HubRemoteTaskSearchServerLine(serverID: entry.id, serverName: entry.name, status: .failed("cancelled")),
                []
            )
        }

        switch outcome {
        case .success(let payload):
            let hits = payload.results.map {
                HubRemoteTaskSearchResult(
                    serverID: entry.id,
                    serverName: entry.name,
                    hit: $0,
                    generatedAt: payload.generatedAt
                )
            }
            return (
                entry.id,
                HubRemoteTaskSearchServerLine(
                    serverID: entry.id,
                    serverName: entry.name,
                    status: .ok(resultCount: hits.count, generatedAt: payload.generatedAt)
                ),
                hits
            )
        case .failure(.missingCapability):
            return (
                entry.id,
                HubRemoteTaskSearchServerLine(serverID: entry.id, serverName: entry.name, status: .missingCapability),
                []
            )
        case .failure(.unauthorized):
            return (
                entry.id,
                HubRemoteTaskSearchServerLine(serverID: entry.id, serverName: entry.name, status: .unauthorized),
                []
            )
        case .failure(.transport(let message)) where message == "cancelled":
            return (
                entry.id,
                HubRemoteTaskSearchServerLine(serverID: entry.id, serverName: entry.name, status: .failed("cancelled")),
                []
            )
        case .failure(let failure):
            let message: String
            switch failure {
            case .rateLimited:
                message = "Rate limited"
            case .invalidResponse:
                message = "Invalid response"
            case .transport(let detail):
                message = detail
            default:
                message = "Unavailable"
            }
            return (
                entry.id,
                HubRemoteTaskSearchServerLine(serverID: entry.id, serverName: entry.name, status: .failed(message)),
                []
            )
        }
    }
}
