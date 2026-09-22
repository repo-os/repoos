import Foundation

struct HubTaskSearchHit: Equatable, Sendable, Identifiable {
    var id: String
    var title: String
    var status: String
    var updatedAt: Date?
    var routePath: String
}

struct HubTaskSearchPayload: Equatable, Sendable {
    var apiVersion: String
    var generatedAt: Date
    var query: String
    var results: [HubTaskSearchHit]
}

enum HubTaskSearchFetchFailure: Error, Equatable, Sendable {
    case missingCapability
    case unauthorized
    case rateLimited(retryAfter: TimeInterval?)
    case transport(String)
    case invalidResponse
}

protocol HubTaskSearchFetching: Sendable {
    func searchTasks(origin: URL, token: String, query: String) async -> Result<HubTaskSearchPayload, HubTaskSearchFetchFailure>
}

struct HubTaskSearchClient: HubTaskSearchFetching {
    private let session: URLSession
    private let decoder: JSONDecoder

    init(session: URLSession = .shared) {
        self.session = session
        self.decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    func searchTasks(origin: URL, token: String, query: String) async -> Result<HubTaskSearchPayload, HubTaskSearchFetchFailure> {
        var components = URLComponents(url: origin, resolvingAgainstBaseURL: true)
        components?.path = "/api/hub/v1/tasks/search"
        components?.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "limit", value: "8"),
        ]
        guard let url = components?.url else {
            return .failure(.invalidResponse)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 12

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.invalidResponse)
            }
            switch http.statusCode {
            case 200:
                return parsePayload(data, fallbackQuery: query)
            case 401:
                return .failure(.unauthorized)
            case 429:
                let retry = parseRetryAfter(http)
                return .failure(.rateLimited(retryAfter: retry))
            default:
                return .failure(.transport("HTTP \(http.statusCode)"))
            }
        } catch is CancellationError {
            return .failure(.transport("cancelled"))
        } catch {
            return .failure(.transport(error.localizedDescription))
        }
    }

    private func parsePayload(_ data: Data, fallbackQuery: String) -> Result<HubTaskSearchPayload, HubTaskSearchFetchFailure> {
        struct WireResult: Decodable {
            var id: String
            var title: String
            var status: String
            var updatedAt: Date?
            var routePath: String
        }
        struct Wire: Decodable {
            var apiVersion: String
            var generatedAt: Date
            var query: String
            var results: [WireResult]
        }

        guard let wire = try? decoder.decode(Wire.self, from: data) else {
            return .failure(.invalidResponse)
        }
        return .success(
            HubTaskSearchPayload(
                apiVersion: wire.apiVersion,
                generatedAt: wire.generatedAt,
                query: wire.query.isEmpty ? fallbackQuery : wire.query,
                results: wire.results.map {
                    HubTaskSearchHit(
                        id: $0.id,
                        title: $0.title,
                        status: $0.status,
                        updatedAt: $0.updatedAt,
                        routePath: $0.routePath
                    )
                }
            )
        )
    }

    private func parseRetryAfter(_ response: HTTPURLResponse) -> TimeInterval? {
        guard let value = response.value(forHTTPHeaderField: "Retry-After") else { return nil }
        if let seconds = TimeInterval(value) { return seconds }
        return nil
    }
}

enum HubTaskSearchRouting {
    static func routePath(taskID: String) -> String {
        let encoded = taskID.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? taskID
        return "/work?task=\(encoded)"
    }
}

struct HubRemoteTaskSearchResult: Equatable, Sendable, Identifiable {
    var serverID: UUID
    var serverName: String
    var hit: HubTaskSearchHit
    var generatedAt: Date

    var id: String { "\(serverID.uuidString)-\(hit.id)" }
}

enum HubRemoteTaskSearchServerStatus: Equatable, Sendable {
    case skipped
    case searching
    case ok(resultCount: Int, generatedAt: Date)
    case offline
    case unauthorized
    case missingCapability
    case failed(String)
}

struct HubRemoteTaskSearchServerLine: Equatable, Sendable, Identifiable {
    var serverID: UUID
    var serverName: String
    var status: HubRemoteTaskSearchServerStatus

    var id: UUID { serverID }
}

enum HubCrossServerTaskSearchPolicy {
    static let minQueryLength = 2
    static let debounceNanoseconds: UInt64 = 350_000_000

    static func eligibleEntries(from entries: [ServerEntry]) -> [ServerEntry] {
        entries.filter { $0.crossServerTaskSearchEnabled }
    }

    static func mergeResults(_ batches: [HubRemoteTaskSearchResult]) -> [HubRemoteTaskSearchResult] {
        batches.sorted { lhs, rhs in
            if lhs.hit.title.localizedCaseInsensitiveCompare(rhs.hit.title) == .orderedSame {
                return lhs.serverName.localizedCaseInsensitiveCompare(rhs.serverName) == .orderedAscending
            }
            return lhs.hit.title.localizedCaseInsensitiveCompare(rhs.hit.title) == .orderedAscending
        }
    }
}
