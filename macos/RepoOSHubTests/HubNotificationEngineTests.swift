import XCTest
@testable import RepoOSHub

final class HubNotificationEngineTests: XCTestCase {
    func testReviewNotificationFiresOnlyOnIncrease() {
        let serverID = UUID()
        let settings = ServerAttentionNotifySettings(
            aggregationEnabled: true,
            notifyReviewReady: true,
            notifyNeedsInput: false,
            notifyActiveAgents: false
        )
        let first = HubNotificationEngine.notificationEvents(
            serverID: serverID,
            serverName: "Local",
            previous: HubAttentionCounts(activeAgents: 0, reviewReadyTasks: 0, needsInputTasks: 0),
            current: HubAttentionCounts(activeAgents: 0, reviewReadyTasks: 2, needsInputTasks: 0),
            settings: settings,
            dedup: .zero
        )
        XCTAssertEqual(first.events.count, 1)
        XCTAssertEqual(first.events.first?.kind, .reviewReady)

        let second = HubNotificationEngine.notificationEvents(
            serverID: serverID,
            serverName: "Local",
            previous: HubAttentionCounts(activeAgents: 0, reviewReadyTasks: 2, needsInputTasks: 0),
            current: HubAttentionCounts(activeAgents: 0, reviewReadyTasks: 2, needsInputTasks: 0),
            settings: settings,
            dedup: first.dedup
        )
        XCTAssertTrue(second.events.isEmpty)
    }

    func testAggregationDisabledSuppressesEvents() {
        let serverID = UUID()
        let settings = ServerAttentionNotifySettings(
            aggregationEnabled: false,
            notifyReviewReady: true,
            notifyNeedsInput: true,
            notifyActiveAgents: true
        )
        let outcome = HubNotificationEngine.notificationEvents(
            serverID: serverID,
            serverName: "Local",
            previous: nil,
            current: HubAttentionCounts(activeAgents: 1, reviewReadyTasks: 3, needsInputTasks: 1),
            settings: settings,
            dedup: .zero
        )
        XCTAssertTrue(outcome.events.isEmpty)
    }

    func testActiveAgentsNotifyOnlyFromZeroBaseline() {
        let serverID = UUID()
        let settings = ServerAttentionNotifySettings(
            aggregationEnabled: true,
            notifyReviewReady: false,
            notifyNeedsInput: false,
            notifyActiveAgents: true
        )
        let first = HubNotificationEngine.notificationEvents(
            serverID: serverID,
            serverName: "Local",
            previous: HubAttentionCounts(activeAgents: 0, reviewReadyTasks: 0, needsInputTasks: 0),
            current: HubAttentionCounts(activeAgents: 2, reviewReadyTasks: 0, needsInputTasks: 0),
            settings: settings,
            dedup: .zero
        )
        XCTAssertEqual(first.events.count, 1)
        XCTAssertEqual(first.events.first?.kind, .activeAgents)

        let second = HubNotificationEngine.notificationEvents(
            serverID: serverID,
            serverName: "Local",
            previous: HubAttentionCounts(activeAgents: 2, reviewReadyTasks: 0, needsInputTasks: 0),
            current: HubAttentionCounts(activeAgents: 3, reviewReadyTasks: 0, needsInputTasks: 0),
            settings: settings,
            dedup: first.dedup
        )
        XCTAssertTrue(second.events.isEmpty)
    }
}
