import Foundation

enum ServerOriginError: Error, Equatable {
    case empty
    case invalidURL
    case notHTTPS
    case credentialsNotAllowed
    case fragmentNotAllowed
    case queryNotAllowed
    case pathNotAllowed
    case missingHost
    case nameEmpty
    case nameTooLong
}

enum ServerOriginNormalizer {
    static let maxNameLength = 80

    static func normalizeOriginInput(_ raw: String) throws -> URL {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw ServerOriginError.empty }

        let input: String
        if trimmed.contains("://") {
            input = trimmed
        } else {
            // A bare local address is the common development-server input.
            // Remote servers still default to the secure scheme.
            let candidate = URLComponents(string: "http://\(trimmed)")
            input = isLoopbackHost(candidate?.host) ? "http://\(trimmed)" : "https://\(trimmed)"
        }
        guard var components = URLComponents(string: input) else {
            throw ServerOriginError.invalidURL
        }

        guard let scheme = components.scheme?.lowercased(),
              scheme == "https" || (scheme == "http" && isLoopbackHost(components.host))
        else {
            throw ServerOriginError.notHTTPS
        }

        if components.user != nil || components.password != nil {
            throw ServerOriginError.credentialsNotAllowed
        }
        if components.fragment != nil {
            throw ServerOriginError.fragmentNotAllowed
        }
        if components.query != nil {
            throw ServerOriginError.queryNotAllowed
        }

        let path = components.percentEncodedPath
        if !path.isEmpty && path != "/" {
            throw ServerOriginError.pathNotAllowed
        }

        guard let host = components.host?.lowercased(), !host.isEmpty else {
            throw ServerOriginError.missingHost
        }
        components.host = host
        components.scheme = scheme
        components.path = ""
        components.fragment = nil
        components.query = nil
        components.user = nil
        components.password = nil

        if (scheme == "https" && components.port == 443) || (scheme == "http" && components.port == 80) {
            components.port = nil
        }

        guard let url = components.url else {
            throw ServerOriginError.invalidURL
        }

        return url
    }

    static func canonicalOriginKey(for url: URL) -> String {
        url.absoluteString
    }

    /// Compares URL origins, deliberately ignoring paths such as `/api/health`.
    static func hasSameOrigin(_ lhs: URL, _ rhs: URL) -> Bool {
        guard
            let lhsScheme = lhs.scheme?.lowercased(),
            let rhsScheme = rhs.scheme?.lowercased(),
            let lhsHost = lhs.host?.lowercased(),
            let rhsHost = rhs.host?.lowercased()
        else {
            return false
        }
        return lhsScheme == rhsScheme
            && lhsHost == rhsHost
            && effectivePort(for: lhs) == effectivePort(for: rhs)
    }

    private static func effectivePort(for url: URL) -> Int? {
        guard let scheme = url.scheme?.lowercased() else { return url.port }
        switch scheme {
        case "https": return url.port ?? 443
        case "http": return url.port ?? 80
        default: return url.port
        }
    }

    /// Plain HTTP is permitted only for a loopback development server. This
    /// intentionally does not treat private-network hosts as local.
    static func isLoopbackHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        return host == "localhost" || host == "::1" || host.split(separator: ".").first == "127"
    }

    static func validateDisplayName(_ name: String) throws -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw ServerOriginError.nameEmpty }
        guard trimmed.unicodeScalars.count <= maxNameLength else { throw ServerOriginError.nameTooLong }
        return trimmed
    }
}
