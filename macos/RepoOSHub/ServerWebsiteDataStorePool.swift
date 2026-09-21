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
        let store = WKWebsiteDataStore(forIdentifier: serverID)
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
        WKWebsiteDataStore.remove(forIdentifier: serverID)
    }
}
