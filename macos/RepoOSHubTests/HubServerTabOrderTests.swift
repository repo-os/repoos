import XCTest
@testable import RepoOSHub

final class HubServerTabOrderTests: XCTestCase {
    func testLayoutDefaultsToSidebarAndSurvivesLegacyPreferences() throws {
        XCTAssertEqual(HubGlobalPreferences.default.navigationLayout, .sidebar)
        XCTAssertTrue(HubGlobalPreferences.default.serverTabOrder.isEmpty)
        XCTAssertTrue(HubGlobalPreferences.default.hiddenServerTabIDs.isEmpty)

        let json = """
        {"notificationsEnabled":true,"dockBadgeEnabled":true}
        """.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(HubGlobalPreferences.self, from: json)
        XCTAssertEqual(decoded.navigationLayout, .sidebar)
    }

    func testUnknownLayoutValueDefaultsToSidebar() throws {
        let json = """
        {"notificationsEnabled":true,"dockBadgeEnabled":true,"navigationLayout":"grid"}
        """.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(HubGlobalPreferences.self, from: json)
        XCTAssertEqual(decoded.navigationLayout, .sidebar)
    }

    func testLayoutAndTabOrderRoundTrip() throws {
        let id = UUID()
        var prefs = HubGlobalPreferences.default
        prefs.navigationLayout = .tabs
        prefs.serverTabOrder = [id]
        prefs.hiddenServerTabIDs = [id]
        let data = try JSONEncoder().encode(prefs)
        let reloaded = try JSONDecoder().decode(HubGlobalPreferences.self, from: data)
        XCTAssertEqual(reloaded.navigationLayout, .tabs)
        XCTAssertEqual(reloaded.serverTabOrder, [id])
        XCTAssertEqual(reloaded.hiddenServerTabIDs, [id])
    }

    func testVisibleTabsFollowOrderAndHideDoesNotDropTheServer() {
        let alpha = entry(name: "alpha", sort: 0)
        let beta = entry(name: "beta", sort: 1)
        let gamma = entry(name: "gamma", sort: 2)
        let entries = [gamma, alpha, beta]
        let visible = HubServerTabOrder.visibleServerIDs(
            entries: entries,
            preferredOrder: [beta.id, alpha.id],
            hiddenIDs: [alpha.id]
        )
        XCTAssertEqual(visible, [beta.id, gamma.id])
        XCTAssertEqual(entries.count, 3)
    }

    func testNewServersAppendAfterThePersistedOrder() {
        let first = entry(name: "first", sort: 1)
        let second = entry(name: "second", sort: 0)
        let visible = HubServerTabOrder.visibleServerIDs(
            entries: [first, second],
            preferredOrder: [first.id],
            hiddenIDs: []
        )
        XCTAssertEqual(visible, [first.id, second.id])
    }

    func testMoveReordersWithoutLosingServers() {
        let a = entry(name: "a", sort: 0)
        let b = entry(name: "b", sort: 1)
        let c = entry(name: "c", sort: 2)
        let moved = HubServerTabOrder.move(
            entries: [a, b, c],
            preferredOrder: [],
            hiddenIDs: [],
            source: c.id,
            to: a.id
        )
        XCTAssertEqual(moved, [c.id, a.id, b.id])
        let movedRight = HubServerTabOrder.move(
            entries: [a, b, c],
            preferredOrder: moved,
            hiddenIDs: [],
            source: c.id,
            to: a.id
        )
        XCTAssertEqual(movedRight, [a.id, c.id, b.id])
    }

    func testSelectionAfterHideClearsWhenTheStripIsEmpty() {
        let kept = UUID()
        let hidden = UUID()
        let cases: [(selected: UUID?, hidden: UUID, remaining: [UUID], expected: UUID?)] = [
            (hidden, hidden, [kept], kept),
            (hidden, hidden, [], nil),
            (kept, hidden, [kept], kept),
            (nil, hidden, [], nil),
        ]
        for sample in cases {
            XCTAssertEqual(
                HubServerTabOrder.selectionAfterHide(
                    selected: sample.selected,
                    hiddenID: sample.hidden,
                    remainingVisible: sample.remaining
                ),
                sample.expected
            )
        }
    }

    func testAdjacentTabWraps() {
        let ids = [UUID(), UUID(), UUID()]
        XCTAssertEqual(HubServerTabOrder.adjacent(visible: ids, selected: ids[2], forward: true), ids[0])
        XCTAssertEqual(HubServerTabOrder.adjacent(visible: ids, selected: ids[0], forward: false), ids[2])
        XCTAssertEqual(HubServerTabOrder.adjacent(visible: ids, selected: nil, forward: true), ids[0])
        XCTAssertNil(HubServerTabOrder.adjacent(visible: [], selected: nil, forward: true))
    }

    private func entry(name: String, sort: Int) -> ServerEntry {
        ServerEntry(name: name, origin: URL(string: "http://127.0.0.1/\(name)")!, sortOrder: sort)
    }
}
