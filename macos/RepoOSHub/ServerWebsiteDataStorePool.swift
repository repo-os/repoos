import Foundation
import WebKit

/// Per-server `WKWebsiteDataStore` instances keep cookies and web storage isolated by registry id.
final class ServerWebsiteDataStorePool {
    static let shared = ServerWebsiteDataStorePool()

    private var stores: [UUID: WKWebsiteDataStore] = [:]
    private let lock = NSLock()

    func dataStore(for serverID: UUID) -> WKWebsiteDataStore {
        lock.lock()
        defer { lock.unlock() }
        if let existing = stores[serverID] {
            return existing
        }
        // Identifier-backed stores are macOS 14+. Keep macOS 13 support with
        // a distinct in-memory store per workspace; it preserves isolation,
        // while persistence begins once the host OS supports the API.
        let store: WKWebsiteDataStore
        if #available(macOS 14.0, *) {
            store = WKWebsiteDataStore(forIdentifier: serverID)
        } else {
            store = .nonPersistent()
        }
        stores[serverID] = store
        return store
    }

    func clearWebsiteData(for serverID: UUID, completion: @escaping () -> Void) {
        let store = dataStore(for: serverID)
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        store.fetchDataRecords(ofTypes: types) { records in
            store.removeData(ofTypes: types, for: records) {
                completion()
            }
        }
    }

    func removeStore(for serverID: UUID) {
        lock.lock()
        stores.removeValue(forKey: serverID)
        lock.unlock()
        if #available(macOS 14.0, *) {
            Task {
                try? await WKWebsiteDataStore.remove(forIdentifier: serverID)
            }
        }
    }
}
