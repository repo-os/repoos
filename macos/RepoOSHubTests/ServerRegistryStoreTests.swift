import XCTest
@testable import RepoOSHub

final class ServerRegistryStoreTests: XCTestCase {
    private var directoryURL: URL!

    override func setUpWithError() throws {
        directoryURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("repoos-hub-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directoryURL)
    }

    func testPersistsEntriesAndSelection() throws {
        let store = ServerRegistryStore(directoryURL: directoryURL)
        let origin = URL(string: "https://hub.example.com")!
        var entry = ServerEntry(name: "Team", origin: origin, sortOrder: 0)
        entry.isPinned = true
        var document = ServerRegistryDocument()
        try store.upsertEntry(entry, in: &document)
        document.lastSelectedServerID = entry.id
        try store.save(document)

        let loaded = try store.load()
        XCTAssertEqual(loaded.entries.count, 1)
        XCTAssertEqual(loaded.entries[0].name, "Team")
        XCTAssertTrue(loaded.entries[0].isPinned)
        XCTAssertEqual(loaded.lastSelectedServerID, entry.id)
    }

    func testDuplicateOriginRejected() throws {
        let store = ServerRegistryStore(directoryURL: directoryURL)
        var document = ServerRegistryDocument()
        let origin = URL(string: "https://same.example.com")!
        try store.upsertEntry(ServerEntry(name: "One", origin: origin), in: &document)
        var second = ServerEntry(name: "Two", origin: origin)
        XCTAssertThrowsError(try store.upsertEntry(second, in: &document)) { error in
            XCTAssertEqual(error as? ServerRegistryStoreError, .duplicateOrigin)
        }
    }

    func testRemoveKeepsOtherEntries() throws {
        let store = ServerRegistryStore(directoryURL: directoryURL)
        var document = ServerRegistryDocument()
        let first = ServerEntry(name: "A", origin: URL(string: "https://a.test")!)
        let second = ServerEntry(name: "B", origin: URL(string: "https://b.test")!, sortOrder: 1)
        try store.upsertEntry(first, in: &document)
        try store.upsertEntry(second, in: &document)
        document.lastSelectedServerID = first.id
        try store.removeEntry(id: first.id, document: &document)
        XCTAssertEqual(document.entries.map(\.name), ["B"])
        XCTAssertEqual(document.lastSelectedServerID, second.id)
    }
}
