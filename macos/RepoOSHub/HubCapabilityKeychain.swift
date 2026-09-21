import Foundation
import Security

protocol HubCapabilityStoring: Sendable {
    func loadToken(serverID: UUID, origin: String) -> String?
    func saveToken(serverID: UUID, origin: String, token: String) throws
    func deleteToken(serverID: UUID, origin: String)
}

enum HubCapabilityKeychainError: Error, Equatable {
    case encodingFailed
    case unexpectedStatus(OSStatus)
}

/// Stores Hub bearer tokens in the macOS Keychain, keyed by server id and canonical origin.
final class HubCapabilityKeychainStore: HubCapabilityStoring, @unchecked Sendable {
    static let shared = HubCapabilityKeychainStore()

    private let service = "org.repoos.hub.capability"

    func accountKey(serverID: UUID, origin: String) -> String {
        "\(serverID.uuidString)|\(origin)"
    }

    func loadToken(serverID: UUID, origin: String) -> String? {
        let account = accountKey(serverID: serverID, origin: origin)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func saveToken(serverID: UUID, origin: String, token: String) throws {
        let account = accountKey(serverID: serverID, origin: origin)
        guard let data = token.data(using: .utf8) else { throw HubCapabilityKeychainError.encodingFailed }
        deleteToken(serverID: serverID, origin: origin)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw HubCapabilityKeychainError.unexpectedStatus(status) }
    }

    func deleteToken(serverID: UUID, origin: String) {
        let account = accountKey(serverID: serverID, origin: origin)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

/// In-memory store for unit tests.
final class InMemoryHubCapabilityStore: HubCapabilityStoring, @unchecked Sendable {
    private var tokens: [String: String] = [:]
    private let lock = NSLock()

    func loadToken(serverID: UUID, origin: String) -> String? {
        lock.lock()
        defer { lock.unlock() }
        return tokens["\(serverID.uuidString)|\(origin)"]
    }

    func saveToken(serverID: UUID, origin: String, token: String) throws {
        lock.lock()
        defer { lock.unlock() }
        tokens["\(serverID.uuidString)|\(origin)"] = token
    }

    func deleteToken(serverID: UUID, origin: String) {
        lock.lock()
        defer { lock.unlock() }
        tokens.removeValue(forKey: "\(serverID.uuidString)|\(origin)")
    }
}
