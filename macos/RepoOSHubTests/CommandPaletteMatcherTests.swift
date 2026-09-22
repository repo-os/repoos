import XCTest
@testable import RepoOSHub

final class CommandPaletteMatcherTests: XCTestCase {
    private let serverA = UUID(uuidString: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA")!
    private let serverB = UUID(uuidString: "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB")!

    private func entry(id: UUID, name: String, origin: String, sortOrder: Int) -> ServerEntry {
        ServerEntry(
            id: id,
            name: name,
            origin: URL(string: origin)!,
            sortOrder: sortOrder
        )
    }

    func testEmptyQueryListsServersAndAddAction() {
        let entries = [
            entry(id: serverA, name: "Local", origin: "https://local.test", sortOrder: 0),
            entry(id: serverB, name: "Team", origin: "https://team.test", sortOrder: 1),
        ]
        let items = CommandPaletteMatcher.buildItems(
            query: "",
            entries: entries,
            recents: [],
            pinnedContexts: []
        )
        XCTAssertTrue(items.contains { $0.title == "Local" })
        XCTAssertTrue(items.contains { $0.title == "Add server…" })
    }

    func testMatchesDisplayNameAndOriginTokens() {
        let entries = [
            entry(id: serverA, name: "Production", origin: "https://prod.example.com", sortOrder: 0),
        ]
        let items = CommandPaletteMatcher.buildItems(
            query: "prod",
            entries: entries,
            recents: [],
            pinnedContexts: []
        )
        XCTAssertEqual(items.first?.title, "Production")
    }

    func testMatchesPinnedTaskIdentifier() {
        let entries = [
            entry(id: serverA, name: "Local", origin: "https://local.test", sortOrder: 0),
        ]
        let pin = PinnedTaskContext(
            serverID: serverA,
            taskIdentifier: "0473",
            routePath: "/tasks/0473",
            label: "Hub navigation"
        )
        let items = CommandPaletteMatcher.buildItems(
            query: "0473",
            entries: entries,
            recents: [],
            pinnedContexts: [pin]
        )
        XCTAssertTrue(items.contains { $0.title == "Hub navigation" })
    }

    func testMatchesRecentRouteTitle() {
        let entries = [
            entry(id: serverA, name: "Local", origin: "https://local.test", sortOrder: 0),
        ]
        let recents = [
            ServerRecentMetadata(
                serverID: serverA,
                recentRoutes: [
                    ServerContextRoute(path: "/board", title: "Task board", lastVisitedAt: Date()),
                ]
            ),
        ]
        let items = CommandPaletteMatcher.buildItems(
            query: "board",
            entries: entries,
            recents: recents,
            pinnedContexts: []
        )
        XCTAssertTrue(items.contains { $0.title == "Task board" })
    }

    func testIncludesRemoteTaskHitsWithFreshnessSubtitle() {
        let entries = [
            entry(id: serverA, name: "Local", origin: "https://local.test", sortOrder: 0),
        ]
        let remote = HubRemoteTaskSearchResult(
            serverID: serverA,
            serverName: "Local",
            hit: HubTaskSearchHit(
                id: "0476",
                title: "Cross-server search",
                status: "active",
                updatedAt: nil,
                routePath: "/work?task=0476"
            ),
            generatedAt: Date()
        )
        let items = CommandPaletteMatcher.buildItems(
            query: "cross",
            entries: entries,
            recents: [],
            pinnedContexts: [],
            remoteTasks: [remote]
        )
        XCTAssertTrue(items.contains { $0.kind == .remoteTask })
        XCTAssertTrue(items.contains { $0.subtitle?.contains("fresh") == true })
    }
}
