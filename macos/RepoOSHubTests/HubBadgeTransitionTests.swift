import XCTest
@testable import RepoOSHub

final class HubBadgeTransitionTests: XCTestCase {
    func testDockBadgeSumsAttentionAcrossServers() {
        let a = UUID()
        let b = UUID()
        let offline = UUID()
        let entries = [
            ServerEntry(id: a, name: "A", origin: URL(string: "https://a.test")!, lastHealth: .healthy, attentionAggregationEnabled: true),
            ServerEntry(id: b, name: "B", origin: URL(string: "https://b.test")!, lastHealth: .healthy, attentionAggregationEnabled: true),
            ServerEntry(id: offline, name: "Offline", origin: URL(string: "https://offline.test")!, lastHealth: .unreachable, attentionAggregationEnabled: true),
        ]
        let snapshots = [
            ServerAttentionSnapshot(
                serverID: a,
                freshness: .fresh,
                counts: HubAttentionCounts(activeAgents: 0, reviewReadyTasks: 2, needsInputTasks: 1),
                fetchedAt: Date(),
                lastError: nil,
                hasCapability: true
            ),
            ServerAttentionSnapshot(
                serverID: b,
                freshness: .fresh,
                counts: HubAttentionCounts(activeAgents: 0, reviewReadyTasks: 1, needsInputTasks: 0),
                fetchedAt: Date(),
                lastError: nil,
                hasCapability: true
            ),
            ServerAttentionSnapshot(
                serverID: offline,
                freshness: .fresh,
                counts: HubAttentionCounts(activeAgents: 0, reviewReadyTasks: 50, needsInputTasks: 40),
                fetchedAt: Date(),
                lastError: nil,
                hasCapability: true
            ),
        ]
        let transition = HubNotificationEngine.dockBadgeTransition(
            previousTotal: 0,
            snapshots: snapshots,
            entries: entries,
            global: .default
        )
        XCTAssertEqual(transition, .set(4))
    }

    func testUnavailableSnapshotsDoNotContribute() {
        let serverID = UUID()
        let entry = ServerEntry(id: serverID, name: "A", origin: URL(string: "https://a.test")!)
        let snapshots = [
            ServerAttentionSnapshot.unavailable(serverID: serverID, hasCapability: false),
        ]
        let transition = HubNotificationEngine.dockBadgeTransition(
            previousTotal: 3,
            snapshots: snapshots,
            entries: [entry],
            global: .default
        )
        XCTAssertEqual(transition, .clear)
    }

    func testDockBadgeDisabledClearsExistingBadge() {
        let serverID = UUID()
        let entry = ServerEntry(id: serverID, name: "A", origin: URL(string: "https://a.test")!)
        let snapshots = [
            ServerAttentionSnapshot(
                serverID: serverID,
                freshness: .fresh,
                counts: HubAttentionCounts(activeAgents: 0, reviewReadyTasks: 2, needsInputTasks: 0),
                fetchedAt: Date(),
                lastError: nil,
                hasCapability: true
            ),
        ]
        let global = HubGlobalPreferences(notificationsEnabled: true, dockBadgeEnabled: false)
        let transition = HubNotificationEngine.dockBadgeTransition(
            previousTotal: 2,
            snapshots: snapshots,
            entries: [entry],
            global: global
        )
        XCTAssertEqual(transition, .clear)
    }
}
