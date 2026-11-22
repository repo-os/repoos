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
        let fileManager = FailingRemovalFileManager()

        XCTAssertThrowsError(try ServerRegistryStore.removeXCTestSupportDirectory(
            environment: ["XCTestConfigurationFilePath": "/x"],
            fileManager: fileManager
        ))
        XCTAssertEqual(fileManager.removalAttempts, 1)
    }

    func testUnreadableRegistryIsSetAsideNotOverwritten() throws {
        let store = ServerRegistryStore(directoryURL: directoryURL)
        let fileURL = directoryURL.appendingPathComponent("servers.json")
        try Data("{ not json".utf8).write(to: fileURL)

        XCTAssertThrowsError(try store.load())
        let moved = try store.setAsideUnreadableRegistry(now: Date(timeIntervalSince1970: 0))

        XCTAssertNotNil(moved)
        XCTAssertFalse(FileManager.default.fileExists(atPath: fileURL.path))
        let preserved = try Data(contentsOf: directoryURL.appendingPathComponent(moved ?? ""))
        XCTAssertEqual(String(data: preserved, encoding: .utf8), "{ not json")
        XCTAssertNil(try store.setAsideUnreadableRegistry(), "nothing left to move")
    }

    func testFailedQuarantineBlocksSavesSoTheFileSurvives() throws {
        let store = ServerRegistryStore(directoryURL: directoryURL)
        let fileURL = directoryURL.appendingPathComponent("servers.json")
        try Data("{ not json".utf8).write(to: fileURL)
        XCTAssertThrowsError(try store.load())

        try setDirectoryWritable(false)
        defer { try? setDirectoryWritable(true) }
        XCTAssertThrowsError(try store.setAsideUnreadableRegistry())
        XCTAssertThrowsError(try store.save(ServerRegistryDocument())) { error in
            XCTAssertEqual(error as? ServerRegistryStoreError, .unreadableRegistry)
        }

        try setDirectoryWritable(true)
        XCTAssertThrowsError(try store.save(ServerRegistryDocument()), "blocked stays blocked")
        XCTAssertEqual(try String(contentsOf: fileURL, encoding: .utf8), "{ not json")
    }

    /// Makes the registry directory unwritable so the next save fails.
    private func setDirectoryWritable(_ writable: Bool) throws {
        try FileManager.default.setAttributes(
            [.posixPermissions: writable ? 0o700 : 0o500],
            ofItemAtPath: directoryURL.path
        )
    }

    @MainActor
    func testFailedDeleteRestoresTheServerAndIsNotPersistedLater() async throws {
        let state = HubAppState(
            store: ServerRegistryStore(directoryURL: directoryURL),
            healthChecker: RemoveReAddHealthChecker(projectName: "divot repoos"),
            attentionCoordinator: HubAttentionCoordinator(notificationCenter: RemoveReAddNotificationCenter())
        )
        let first = try await saveDraft(state, origin: "localhost:7171")
        XCTAssertNil(first)
        let server = try XCTUnwrap(state.entries.first)

        try setDirectoryWritable(false)
        defer { try? setDirectoryWritable(true) }
        state.deleteServer(server)
        XCTAssertEqual(state.entries.map(\.id), [server.id], "a failed removal keeps the server visible")
        XCTAssertNotNil(state.lastConnectionMessage)

        try setDirectoryWritable(true)
        let second = try await saveDraft(state, origin: "localhost:7172")
        XCTAssertNil(second)
        let persisted = try ServerRegistryStore(directoryURL: directoryURL).load()
        XCTAssertEqual(Set(persisted.entries.map(\.id)).count, 2, "the failed removal must not be persisted")
        XCTAssertTrue(persisted.entries.contains { $0.id == server.id })
    }

    @MainActor
    func testFailedEditSaveRestoresTheDisplayedRegistry() async throws {
        let state = HubAppState(
            store: ServerRegistryStore(directoryURL: directoryURL),
            healthChecker: RemoveReAddHealthChecker(projectName: "divot repoos"),
            attentionCoordinator: HubAttentionCoordinator(notificationCenter: RemoveReAddNotificationCenter())
        )
        let saved = try await saveDraft(state, origin: "localhost:7171")
        XCTAssertNil(saved)

        let retainedBefore = state.retainedWorkspaceServerIDs
        let residencyBefore = state.workspaceResidencyLRU
        try setDirectoryWritable(false)
        defer { try? setDirectoryWritable(true) }
        let error = try await saveDraft(state, origin: "localhost:7172")
        XCTAssertEqual(error, "Could not save the server locally.")
        XCTAssertEqual(state.entries.count, 1, "the failed add is not shown")
        XCTAssertEqual(state.retainedWorkspaceServerIDs, retainedBefore, "no phantom retained workspace")
        XCTAssertEqual(state.workspaceResidencyLRU, residencyBefore, "no phantom LRU entry")
    }

    @MainActor
    func testFailedEditRestoresNameAndResidencyState() async throws {
        let state = HubAppState(
            store: ServerRegistryStore(directoryURL: directoryURL),
            healthChecker: RemoveReAddHealthChecker(projectName: "divot repoos"),
            attentionCoordinator: HubAttentionCoordinator(notificationCenter: RemoveReAddNotificationCenter())
        )
        let saved = try await saveDraft(state, origin: "localhost:7171")
        XCTAssertNil(saved)
        let server = try XCTUnwrap(state.entries.first)
        let retainedBefore = state.retainedWorkspaceServerIDs
        let residencyBefore = state.workspaceResidencyLRU

        try setDirectoryWritable(false)
        defer { try? setDirectoryWritable(true) }
        let error = await state.saveFromEditor(
            ServerEditorDraft(
                mode: .edit(server),
                name: "Renamed",
                originText: "localhost:7171",
                groupName: "",
                accentColorHex: "",
                iconSymbolName: "",
                isPinned: false
            )
        )
        XCTAssertEqual(error, "Could not save the server locally.")
        XCTAssertEqual(state.entries.first?.name, "divot repoos", "the failed rename is not shown")
        XCTAssertEqual(state.retainedWorkspaceServerIDs, retainedBefore)
        XCTAssertEqual(state.workspaceResidencyLRU, residencyBefore)
    }

    @MainActor
    private func saveDraft(_ state: HubAppState, origin: String) async throws -> String? {
        await state.saveFromEditor(
            ServerEditorDraft(
                mode: .add,
                name: "",
                originText: origin,
                groupName: "",
                accentColorHex: "",
                iconSymbolName: "",
                isPinned: false
            )
        )
    }

    @MainActor
    func testRemoveThenAddSameServerAgainKeepsRegistryUsable() async throws {
        let state = HubAppState(
            store: ServerRegistryStore(directoryURL: directoryURL),
            healthChecker: RemoveReAddHealthChecker(projectName: "divot repoos"),
            attentionCoordinator: HubAttentionCoordinator(notificationCenter: RemoveReAddNotificationCenter())
        )
        let draft = ServerEditorDraft(
            mode: .add,
            name: "",
            originText: "localhost:7171",
            groupName: "",
            accentColorHex: "",
            iconSymbolName: "",
            isPinned: false
        )
        let firstSave = await state.saveFromEditor(draft)
        XCTAssertNil(firstSave)
        let original = try XCTUnwrap(state.entries.first)

        state.deleteServer(original)
        XCTAssertTrue(state.entries.isEmpty)
        XCTAssertNil(state.lastConnectionMessage)

        let secondSave = await state.saveFromEditor(draft)
        XCTAssertNil(secondSave)
        XCTAssertEqual(state.entries.count, 1)
        XCTAssertEqual(state.entries.first?.name, "divot repoos")
        XCTAssertNotEqual(state.entries.first?.id, original.id)
    }

    func testIndexedByIDKeepsFirstEntryForDuplicateIDs() {
        let id = UUID()
        var first = ServerEntry(name: "First", origin: URL(string: "http://localhost:7171")!, sortOrder: 0)
        first.id = id
        var second = ServerEntry(name: "Second", origin: URL(string: "http://localhost:7172")!, sortOrder: 1)
        second.id = id

        let indexed = [first, second].indexedByID()

        XCTAssertEqual(indexed.count, 1)
        XCTAssertEqual(indexed[id]?.name, "First")
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

private final class FailingRemovalFileManager: FileManager {
    private(set) var removalAttempts = 0

    override func fileExists(atPath path: String) -> Bool { true }

    override func removeItem(at URL: URL) throws {
        removalAttempts += 1
        throw CocoaError(.fileWriteNoPermission)
    }
}

private struct RemoveReAddHealthChecker: HealthChecking {
    var projectName: String?

    func checkHealth(origin: URL) async -> HealthCheckOutcome {
        .success(projectName: projectName)
    }
}

private struct RemoveReAddNotificationCenter: HubUserNotificationCentering {
    func post(event: HubAttentionNotificationEvent) {}
}
