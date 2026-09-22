import Foundation

enum HealthCheckFailure: Error, Equatable {
    case timeout
    case tls
    case network(String)
    case httpStatus(Int)
    case redirect(URL)
    case invalidJSON
    case notRepoOS
}

enum HealthCheckOutcome: Equatable {
    case success(projectName: String?, runtimeInfo: ServerRuntimeInfo? = nil)
    case failure(HealthCheckFailure)
}

protocol HealthChecking: Sendable {
    func checkHealth(origin: URL) async -> HealthCheckOutcome
}

struct HealthResponsePayload: Decodable {
    let ok: Bool?
    let projectName: String?
    let root: String?
    let branch: String?
    let taskCount: Int?
    let version: String?
    let buildAt: String?
    let serverStartedAt: String?
}

struct ServerRuntimeInfo: Equatable, Sendable {
    let branch: String?
    let taskCount: Int?
    let version: String?
    let buildAt: Date?
    let startedAt: Date?

    init(payload: HealthResponsePayload) {
        branch = payload.branch
        taskCount = payload.taskCount
        version = payload.version
        buildAt = Self.date(from: payload.buildAt)
        startedAt = Self.date(from: payload.serverStartedAt)
    }

    private static func date(from value: String?) -> Date? {
        guard let value else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value)
    }

    var hasDetails: Bool {
        branch != nil || taskCount != nil || version != nil || buildAt != nil || startedAt != nil
    }
}

final class HealthCheckRedirectGuard: NSObject, URLSessionTaskDelegate {
    let expectedOrigin: URL

    init(expectedOrigin: URL) {
        self.expectedOrigin = expectedOrigin
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        guard let target = request.url else {
            completionHandler(nil)
            return
        }
        if !ServerOriginNormalizer.hasSameOrigin(target, expectedOrigin)
        {
            completionHandler(nil)
            return
        }
        completionHandler(request)
    }
}

struct RepoOSHealthChecker: HealthChecking {
    static let defaultTimeout: TimeInterval = 10

    var timeout: TimeInterval

    init(timeout: TimeInterval = defaultTimeout) {
        self.timeout = timeout
    }

    func checkHealth(origin: URL) async -> HealthCheckOutcome {
        var components = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
        components.path = "/api/health"
        guard let healthURL = components.url else {
            return .failure(.network("Invalid origin URL."))
        }
        let redirectGuard = HealthCheckRedirectGuard(expectedOrigin: origin)
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = timeout
        config.timeoutIntervalForResource = timeout
        config.waitsForConnectivity = false
        let session = URLSession(configuration: config, delegate: redirectGuard, delegateQueue: nil)

        var request = URLRequest(url: healthURL)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalCacheData

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.invalidJSON)
            }
            if http.url.map({ !ServerOriginNormalizer.hasSameOrigin($0, origin) }) == true {
                return .failure(.redirect(http.url ?? origin))
            }
            guard (200 ... 299).contains(http.statusCode) else {
                return .failure(.httpStatus(http.statusCode))
            }
            let payload = try JSONDecoder().decode(HealthResponsePayload.self, from: data)
            guard payload.ok == true else {
                return .failure(.notRepoOS)
            }
            let runtimeInfo = ServerRuntimeInfo(payload: payload)
            return .success(
                projectName: payload.projectName ?? repositoryName(from: payload.root),
                runtimeInfo: runtimeInfo.hasDetails ? runtimeInfo : nil
            )
        } catch let error as URLError {
            switch error.code {
            case .timedOut:
                return .failure(.timeout)
            case .secureConnectionFailed, .serverCertificateUntrusted, .clientCertificateRejected:
                return .failure(.tls)
            case .cancelled:
                return .failure(.redirect(origin))
            default:
                return .failure(.network(error.localizedDescription))
            }
        } catch is DecodingError {
            return .failure(.invalidJSON)
        } catch {
            return .failure(.network(error.localizedDescription))
        }
    }

    private func repositoryName(from root: String?) -> String? {
        guard let root = root?.trimmingCharacters(in: .whitespacesAndNewlines), !root.isEmpty else {
            return nil
        }
        let name = URL(fileURLWithPath: root).lastPathComponent
        return name.isEmpty || name == "/" ? nil : name
    }
}

extension HealthCheckFailure {
    var userMessage: String {
        switch self {
        case .timeout:
            return "The server did not respond before the timeout. Check the address and try again."
        case .tls:
            return "Could not establish a secure HTTPS connection. Verify the certificate or use a trusted local proxy."
        case .network(let detail):
            return "Could not reach the server. \(detail)"
        case .httpStatus(let code):
            return "The server returned HTTP \(code). Confirm this is a RepoOS endpoint."
        case .redirect(let url):
            return "The server redirected away from \(url.absoluteString). Use the canonical server origin."
        case .invalidJSON:
            return "The health response was not valid JSON from a RepoOS server."
        case .notRepoOS:
            return "The server responded, but /api/health did not report ok: true."
        }
    }
}
