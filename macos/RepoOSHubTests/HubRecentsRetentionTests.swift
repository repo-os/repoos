import XCTest
@testable import RepoOSHub

final class HubRecentsRetentionTests: XCTestCase {
    private let serverID = UUID()

    func testRecordVisitDedupesAndOrdersMostRecentFirst() {
        var meta = ServerRecentMetadata(serverID: serverID)
        let first = Date(timeIntervalSince1970: 100)
        let second = Date(timeIntervalSince1970: 200)

        meta = HubRecentsRetention.recordVisit(path: "/tasks/1", title: "One", visitedAt: first, metadata: meta)
        meta = HubRecentsRetention.recordVisit(path: "/tasks/2", title: "Two", visitedAt: second, metadata: meta)
        meta = HubRecentsRetention.recordVisit(path: "/tasks/1", title: "One again", visitedAt: second, metadata: meta)

        XCTAssertEqual(meta.recentRoutes.count, 2)
        XCTAssertEqual(meta.recentRoutes[0].path, "/tasks/1")
        XCTAssertEqual(meta.recentRoutes[0].title, "One again")
        XCTAssertEqual(meta.recentRoutes[1].path, "/tasks/2")
        XCTAssertEqual(meta.lastRoutePath, "/tasks/1")
    }

    func testRecordVisitCapsListSize() {
        var meta = ServerRecentMetadata(serverID: serverID)
        for index in 0..<(HubRecentsRetention.maxRecentRoutesPerServer + 3) {
            meta = HubRecentsRetention.recordVisit(
                path: "/route/\(index)",
                title: nil,
                visitedAt: Date(timeIntervalSince1970: TimeInterval(index)),
                metadata: meta
            )
        }
        XCTAssertEqual(meta.recentRoutes.count, HubRecentsRetention.maxRecentRoutesPerServer)
        XCTAssertEqual(meta.recentRoutes.first?.path, "/route/\(HubRecentsRetention.maxRecentRoutesPerServer + 2)")
    }

    func testNormalizeRoutePath() {
        XCTAssertEqual(HubRecentsRetention.normalizeRoutePath("tasks/1"), "/tasks/1")
        XCTAssertEqual(HubRecentsRetention.normalizeRoutePath("/tasks/1/"), "/tasks/1")
        XCTAssertEqual(HubRecentsRetention.normalizeRoutePath("  "), "")
    }

    func testNormalizesTaskNumbersForPinning() {
        XCTAssertEqual(HubAppState.normalizedTaskIdentifier("1"), "0001")
        XCTAssertEqual(HubAppState.normalizedTaskIdentifier(" #0471 "), "0471")
        XCTAssertNil(HubAppState.normalizedTaskIdentifier("task 1"))
        XCTAssertNil(HubAppState.normalizedTaskIdentifier(""))
    }

    func testPruneRemovesOrphanServerMetadata() {
        let keep = UUID()
        let drop = UUID()
        let recents = [
            ServerRecentMetadata(serverID: keep),
            ServerRecentMetadata(serverID: drop),
        ]
        let pinned = [
            PinnedTaskContext(serverID: keep, taskIdentifier: "1", routePath: "/t", label: "A"),
            PinnedTaskContext(serverID: drop, taskIdentifier: "2", routePath: "/t", label: "B"),
        ]
        let prunedRecents = HubRecentsRetention.prune(metadata: recents, validServerIDs: [keep])
        let prunedPins = HubRecentsRetention.prune(pinned: pinned, validServerIDs: [keep])
        XCTAssertEqual(prunedRecents.map(\.serverID), [keep])
        XCTAssertEqual(prunedPins.count, 1)
        XCTAssertEqual(prunedPins[0].serverID, keep)
    }

    func testRecordVisitDoesNotCreatePinnedContext() {
        var meta = ServerRecentMetadata(serverID: serverID)
        meta = HubRecentsRetention.recordVisit(path: "/tasks/99", title: "Task", visitedAt: Date(), metadata: meta)
        XCTAssertEqual(meta.recentRoutes.count, 1)
        // Pinned contexts are a separate collection — recents never imply a pin.
        let pinned: [PinnedTaskContext] = []
        XCTAssertTrue(pinned.isEmpty)
    }

    @MainActor
    func testRegistryRestoresLastSelectedServer() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("hub-nav-restore-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let store = ServerRegistryStore(directoryURL: directory)
        let first = ServerEntry(name: "A", origin: URL(string: "https://a.test")!, sortOrder: 0)
        let second = ServerEntry(name: "B", origin: URL(string: "https://b.test")!, sortOrder: 1)
        var document = ServerRegistryDocument()
        try store.upsertEntry(first, in: &document)
        try store.upsertEntry(second, in: &document)
        document.lastSelectedServerID = second.id
        document.serverRecents = [
            ServerRecentMetadata(serverID: second.id, recentRoutes: [], lastRoutePath: "/tasks/0473"),
        ]
        try store.save(document)

        let state = HubAppState(
            store: store,
            healthChecker: StubHealthChecker(),
            attentionCoordinator: HubAttentionCoordinator()
        )
        XCTAssertEqual(state.selectedServerID, second.id)
        XCTAssertEqual(state.pendingNavigationRequest?.path, "/tasks/0473")
    }

    @MainActor
    func testSelectingServersRetainsEachVisitedWorkspace() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("hub-retained-workspaces-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let store = ServerRegistryStore(directoryURL: directory)
        let first = ServerEntry(name: "First", origin: URL(string: "https://first.test")!)
        let second = ServerEntry(name: "Second", origin: URL(string: "https://second.test")!)
        var document = ServerRegistryDocument()
        try store.upsertEntry(first, in: &document)
        try store.upsertEntry(second, in: &document)
        document.lastSelectedServerID = first.id
        try store.save(document)

        let state = HubAppState(
            store: store,
            healthChecker: StubHealthChecker(),
            attentionCoordinator: HubAttentionCoordinator()
        )
        state.selectServer(second.id)

        XCTAssertEqual(Set(state.retainedWorkspaceEntries.map(\.id)), [first.id, second.id])
    }

    @MainActor
    func testWorkspaceNavigationUpdateIsStableForAnUnchangedSnapshot() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("hub-navigation-state-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let state = HubAppState(
            store: ServerRegistryStore(directoryURL: directory),
            healthChecker: StubHealthChecker(),
            attentionCoordinator: HubAttentionCoordinator()
        )
        let snapshot = WorkspaceNavigationSnapshot(
            hasEmbeddedWebContent: true,
            webCanGoBack: false,
            webCanGoForward: false,
            webIsLoading: true
        )

        state.updateWorkspaceNavigation(snapshot)
        state.updateWorkspaceNavigation(snapshot)

        XCTAssertEqual(state.workspaceNavigation, snapshot)
    }

    @MainActor
    func testAddingServerUsesProjectNameReportedByHealthCheck() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("hub-project-name-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let state = HubAppState(
            store: ServerRegistryStore(directoryURL: directory),
            healthChecker: StubHealthChecker(projectName: "  My Repo  "),
            attentionCoordinator: HubAttentionCoordinator()
        )
        let error = await state.saveFromEditor(
            ServerEditorDraft(
                mode: .add,
                name: "",
                originText: "localhost:7171",
                groupName: "",
                accentColorHex: "",
                iconSymbolName: "",
                isPinned: false
            )
        )

        XCTAssertNil(error)
        XCTAssertEqual(state.entries.first?.name, "My Repo")
        XCTAssertEqual(state.entries.first?.repositoryName, "My Repo")
    }

    @MainActor
    func testHealthRefreshNamesLegacyAddressEntriesFromTheirRepository() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("hub-legacy-name-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let store = ServerRegistryStore(directoryURL: directory)
        let entry = ServerEntry(name: "localhost:7171", origin: URL(string: "http://localhost:7171")!)
        var document = ServerRegistryDocument()
        try store.upsertEntry(entry, in: &document)
        try store.save(document)

        let state = HubAppState(
            store: store,
            healthChecker: StubHealthChecker(projectName: "RepoOS"),
            attentionCoordinator: HubAttentionCoordinator()
        )
        await state.refreshHealth(for: entry.id)

        XCTAssertEqual(state.entries.first?.name, "RepoOS")
        XCTAssertEqual(state.entries.first?.repositoryName, "RepoOS")
    }

    @MainActor
    func testStartupHealthRefreshUpdatesMemoryAndSearchWithoutWritingRegistry() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("hub-startup-health-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let store = ServerRegistryStore(directoryURL: directory)
        let editedAt = Date(timeIntervalSince1970: 100)
        let checkedAt = Date(timeIntervalSince1970: 200)
        let entry = ServerEntry(
            name: "QA local",
            origin: URL(string: "http://127.0.0.1:7171")!,
            updatedAt: editedAt,
            lastHealth: .healthy,
            lastHealthAt: checkedAt,
            crossServerTaskSearchEnabled: true
        )
        var document = ServerRegistryDocument()
        try store.upsertEntry(entry, in: &document)
        try store.save(document)

        let search = HubCrossServerTaskSearchEngine()
        let state = HubAppState(
            store: store,
            healthChecker: OfflineHealthChecker(),
            attentionCoordinator: HubAttentionCoordinator(),
            crossServerTaskSearch: search
        )
        await state.refreshAllHealth()

        XCTAssertEqual(state.entries.first?.lastHealth, .unreachable)
        XCTAssertNotNil(state.entries.first?.lastHealthAt)
        XCTAssertEqual(state.entries.first?.updatedAt, editedAt)
        XCTAssertEqual(try store.load().entries.first?.lastHealth, .healthy)
        XCTAssertEqual(try store.load().entries.first?.lastHealthAt, checkedAt)

        state.recordRouteVisit(serverID: entry.id, path: "/tasks", title: "Tasks")
        let savedAfterUnrelatedWrite = try store.load().entries.first
        XCTAssertEqual(savedAfterUnrelatedWrite?.lastHealth, .healthy)
        XCTAssertEqual(savedAfterUnrelatedWrite?.lastHealthAt, checkedAt)
        XCTAssertEqual(savedAfterUnrelatedWrite?.updatedAt, editedAt)
        XCTAssertEqual(state.entries.first?.lastHealth, .unreachable)

        search.scheduleSearch(query: "qa")
        try? await Task.sleep(nanoseconds: 500_000_000)
        XCTAssertEqual(search.serverLines.first?.status, .offline)
        XCTAssertFalse(search.isSearching)
    }
}

private struct StubHealthChecker: HealthChecking {
    var projectName: String? = nil

    func checkHealth(origin: URL) async -> HealthCheckOutcome {
        .success(projectName: projectName)
    }
}

private struct OfflineHealthChecker: HealthChecking {
    func checkHealth(origin: URL) async -> HealthCheckOutcome {
        .failure(.network("Offline"))
    }
}
