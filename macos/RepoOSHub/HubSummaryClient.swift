import Foundation

protocol HubSummaryFetching: Sendable {
    func fetchSummary(origin: URL, token: String) async -> Result<HubSummaryPayload, HubSummaryFetchFailure>
}

struct HubSummaryClient: HubSummaryFetching {
    private let session: URLSession
    private let decoder: JSONDecoder

    init(session: URLSession = .shared) {
        self.session = session
        self.decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    func fetchSummary(origin: URL, token: String) async -> Result<HubSummaryPayload, HubSummaryFetchFailure> {
        guard let url = URL(string: "/api/hub/v1/summary", relativeTo: origin) else {
            return .failure(.invalidResponse)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 15

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.invalidResponse)
            }
            switch http.statusCode {
            case 200:
                return parseSummary(data)
            case 401:
                return .failure(.unauthorized)
            case 429:
                let retry = parseRetryAfter(http)
                return .failure(.rateLimited(retryAfter: retry))
            default:
                return .failure(.transport("HTTP \(http.statusCode)"))
            }
        } catch {
            return .failure(.transport(error.localizedDescription))
        }
    }

    private func parseSummary(_ data: Data) -> Result<HubSummaryPayload, HubSummaryFetchFailure> {
        struct Wire: Decodable {
            struct Attention: Decodable {
                var activeAgents: Int
                var reviewReadyTasks: Int
                var needsInputTasks: Int
            }

            var apiVersion: String
            var generatedAt: Date
            var lastActivityAt: Date?
            var attention: Attention
        }

        guard let wire = try? decoder.decode(Wire.self, from: data) else {
            return .failure(.invalidResponse)
        }
        return .success(
            HubSummaryPayload(
                apiVersion: wire.apiVersion,
                generatedAt: wire.generatedAt,
                lastActivityAt: wire.lastActivityAt,
                attention: HubAttentionCounts(
                    activeAgents: wire.attention.activeAgents,
                    reviewReadyTasks: wire.attention.reviewReadyTasks,
                    needsInputTasks: wire.attention.needsInputTasks
                )
            )
        )
    }

    private func parseRetryAfter(_ response: HTTPURLResponse) -> TimeInterval? {
        guard let value = response.value(forHTTPHeaderField: "Retry-After") else { return nil }
        if let seconds = TimeInterval(value) { return seconds }
        return nil
    }
}
