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

        let input = trimmed.contains("://") ? trimmed : "https://\(trimmed)"
        guard var components = URLComponents(string: input) else {
            throw ServerOriginError.invalidURL
        }

        guard let scheme = components.scheme?.lowercased(), scheme == "https" else {
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
        components.scheme = "https"
        components.path = ""
        components.fragment = nil
        components.query = nil
        components.user = nil
        components.password = nil

        if components.port == 443 {
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

    static func validateDisplayName(_ name: String) throws -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw ServerOriginError.nameEmpty }
        guard trimmed.unicodeScalars.count <= maxNameLength else { throw ServerOriginError.nameTooLong }
        return trimmed
    }
}
