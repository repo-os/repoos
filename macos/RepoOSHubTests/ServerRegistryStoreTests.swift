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

    func testApplicationSupportDirectoryCanBeIsolatedForManualQA() {
        let isolatedDirectory = "/tmp/repoos-hub-qa"
        XCTAssertEqual(
            ServerRegistryStore.applicationSupportDirectory(
                environment: ["REPOOS_HUB_SUPPORT_DIRECTORY": isolatedDirectory]
            ).path,
            isolatedDirectory
        )
    }

    func testApplicationSupportDirectoryResolutionTable() {
        let realDirectory = ServerRegistryStore.applicationSupportDirectory(environment: [:]).path
        let cases: [(name: String, environment: [String: String], expectation: (String) -> Bool)] = [
          (
            "explicit override wins under XCTest",
            ["REPOOS_HUB_SUPPORT_DIRECTORY": "/tmp/override", "XCTestConfigurationFilePath": "/x"],
            { $0 == "/tmp/override" }
          ),
          (
            "XCTest host without override never uses the real registry",
            ["XCTestConfigurationFilePath": "/x"],
            { $0 != realDirectory && !$0.contains("Application Support") && $0.contains("RepoOS Hub-xctest-") }
          ),
          (
            "normal launch keeps the user's Application Support registry",
            [:],
            { $0.hasSuffix("/RepoOS Hub") && $0.contains("Application Support") }
          ),
        ]
        for testCase in cases {
          let resolved = ServerRegistryStore.applicationSupportDirectory(environment: testCase.environment).path
          XCTAssertTrue(testCase.expectation(resolved), "\(testCase.name): got \(resolved)")
        }
    }

    func testRemovesXCTestSupportDirectory() throws {
        let supportPath = ServerRegistryStore.applicationSupportDirectory(
            environment: ["XCTestConfigurationFilePath": "/x"]
        ).path
        let directory = URL(fileURLWithPath: supportPath, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        try ServerRegistryStore.removeXCTestSupportDirectory(environment: ["XCTestConfigurationFilePath": "/x"])

        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.path))
    }

    func testXCTestSupportCleanupPropagatesRemovalFailure() throws {
        let supportPath = ServerRegistryStore.applicationSupportDirectory(
            environment: ["XCTestConfigurationFilePath": "/x"]
        ).path
        let directory = URL(fileURLWithPath: supportPath, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let child = directory.appendingPathComponent("not-empty")
        try Data().write(to: child)
        defer { try? FileManager.default.removeItem(at: directory) }

        XCTAssertThrowsError(try ServerRegistryStore.removeXCTestSupportDirectory(
            environment: ["XCTestConfigurationFilePath": "/x"]
        ))
        XCTAssertTrue(FileManager.default.fileExists(atPath: directory.path))
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
