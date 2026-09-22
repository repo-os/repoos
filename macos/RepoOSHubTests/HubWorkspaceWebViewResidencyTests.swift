import XCTest
@testable import RepoOSHub

final class HubWorkspaceWebViewResidencyTests: XCTestCase {
    func testDefaultBudgetConstants() {
        XCTAssertEqual(HubWorkspaceWebViewResidency.maxInactiveWorkspaceWebViews, 4)
        XCTAssertEqual(HubWorkspaceWebViewResidency.maxLiveWorkspaceWebViews, 5)
        XCTAssertEqual(
            HubWorkspaceWebViewResidency.maxInactive(for: .warning),
            HubWorkspaceWebViewResidency.memoryPressureWarnInactiveWorkspaceWebViews
        )
        XCTAssertEqual(
            HubWorkspaceWebViewResidency.maxInactive(for: .critical),
            HubWorkspaceWebViewResidency.memoryPressureCriticalInactiveWorkspaceWebViews
        )
    }

    func testTouchMovesServerToFront() {
        let a = UUID()
        let b = UUID()
        let c = UUID()
        let order = HubWorkspaceWebViewResidency.touch(serverID: c, in: [a, b])
        XCTAssertEqual(order, [c, a, b])
        XCTAssertEqual(HubWorkspaceWebViewResidency.touch(serverID: a, in: order), [a, c, b])
    }

    func testApplyingBudgetKeepsActiveAndMostRecentInactive() {
        let active = UUID()
        let recent = [UUID(), UUID(), UUID(), UUID(), UUID()]
        let lru = [active] + recent
        let retained = Set(lru)
        let (kept, evicted) = HubWorkspaceWebViewResidency.applyingBudget(
            retained: retained,
            lruOrder: lru,
            activeServerID: active,
            maxInactive: HubWorkspaceWebViewResidency.maxInactiveWorkspaceWebViews
        )
        XCTAssertTrue(kept.contains(active))
        XCTAssertEqual(kept.count, HubWorkspaceWebViewResidency.maxLiveWorkspaceWebViews)
        XCTAssertEqual(evicted, retained.subtracting(kept))
        XCTAssertEqual(evicted, Set(recent.suffix(1)))
    }

    func testApplyingBudgetNeverEvictsActive() {
        let active = UUID()
        let other = UUID()
        let retained: Set<UUID> = [active, other]
        let (_, evicted) = HubWorkspaceWebViewResidency.applyingBudget(
            retained: retained,
            lruOrder: [other, active],
            activeServerID: active,
            maxInactive: 0
        )
        XCTAssertFalse(evicted.contains(active))
        XCTAssertEqual(evicted, [other])
    }

    func testMemoryPressureCapsReduceInactiveRetention() {
        let active = UUID()
        let inactive = (0..<4).map { _ in UUID() }
        let retained = Set([active] + inactive)
        let lru = [active] + inactive

        let warnKept = HubWorkspaceWebViewResidency.applyingBudget(
            retained: retained,
            lruOrder: lru,
            activeServerID: active,
            maxInactive: HubWorkspaceWebViewResidency.maxInactive(for: .warning)
        ).retained
        XCTAssertEqual(warnKept.count, 1 + HubWorkspaceWebViewResidency.memoryPressureWarnInactiveWorkspaceWebViews)

        let criticalKept = HubWorkspaceWebViewResidency.applyingBudget(
            retained: retained,
            lruOrder: lru,
            activeServerID: active,
            maxInactive: HubWorkspaceWebViewResidency.maxInactive(for: .critical)
        ).retained
        XCTAssertEqual(criticalKept, [active])
    }

    @MainActor
    func testVisitingManyServersCapsRetainedWorkspaces() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("hub-residency-cap-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let store = ServerRegistryStore(directoryURL: directory)
        var document = ServerRegistryDocument()
        let servers = (0..<7).map { index in
            ServerEntry(
                name: "S\(index)",
                origin: URL(string: "https://s\(index).test")!,
                sortOrder: index
            )
        }
        for server in servers {
            try store.upsertEntry(server, in: &document)
        }
        document.lastSelectedServerID = servers[0].id
        try store.save(document)

        let state = HubAppState(
            store: store,
            healthChecker: StubHealthChecker(),
            attentionCoordinator: HubAttentionCoordinator()
        )

        for server in servers.dropFirst() {
            state.selectServer(server.id)
        }

        XCTAssertEqual(
            state.retainedWorkspaceServerIDs.count,
            HubWorkspaceWebViewResidency.maxLiveWorkspaceWebViews
        )
        XCTAssertTrue(state.retainedWorkspaceServerIDs.contains(servers.last!.id))
    }

    @MainActor
    func testMemoryPressureTrimsInactiveWebViews() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("hub-residency-pressure-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let store = ServerRegistryStore(directoryURL: directory)
        var document = ServerRegistryDocument()
        let servers = (0..<5).map { index in
            ServerEntry(name: "P\(index)", origin: URL(string: "https://p\(index).test")!, sortOrder: index)
        }
        for server in servers {
            try store.upsertEntry(server, in: &document)
        }
        try store.save(document)

        let state = HubAppState(
            store: store,
            healthChecker: StubHealthChecker(),
            attentionCoordinator: HubAttentionCoordinator()
        )
        for server in servers {
            state.selectServer(server.id)
        }

        state.applyWorkspaceResidencyMemoryPressure(.warning)
        XCTAssertEqual(
            state.retainedWorkspaceServerIDs.count,
            1 + HubWorkspaceWebViewResidency.memoryPressureWarnInactiveWorkspaceWebViews
        )

        state.applyWorkspaceResidencyMemoryPressure(.critical)
        XCTAssertEqual(state.retainedWorkspaceServerIDs, [servers.last!.id])
    }

    @MainActor
    func testColdReturnRestoresLastRouteAfterEviction() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("hub-residency-route-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let store = ServerRegistryStore(directoryURL: directory)
        let cold = ServerEntry(name: "Cold", origin: URL(string: "https://cold.test")!)
        var document = ServerRegistryDocument()
        try store.upsertEntry(cold, in: &document)
        document.serverRecents = [
            ServerRecentMetadata(serverID: cold.id, recentRoutes: [], lastRoutePath: "/tasks/0484"),
        ]

        let warmServers = (0..<6).map { index in
            ServerEntry(name: "W\(index)", origin: URL(string: "https://w\(index).test")!, sortOrder: index + 1)
        }
        for server in warmServers {
            try store.upsertEntry(server, in: &document)
        }
        document.lastSelectedServerID = warmServers.last!.id
        try store.save(document)

        let state = HubAppState(
            store: store,
            healthChecker: StubHealthChecker(),
            attentionCoordinator: HubAttentionCoordinator()
        )
        for server in warmServers {
            state.selectServer(server.id)
        }
        XCTAssertFalse(state.retainedWorkspaceServerIDs.contains(cold.id))

        state.selectServer(cold.id)
        XCTAssertTrue(state.retainedWorkspaceServerIDs.contains(cold.id))
        XCTAssertEqual(state.pendingNavigationRequest?.path, "/tasks/0484")
    }
}

private struct StubHealthChecker: HealthChecking {
    func checkHealth(origin: URL) async -> HealthCheckOutcome {
        .success(projectName: nil)
    }
}
