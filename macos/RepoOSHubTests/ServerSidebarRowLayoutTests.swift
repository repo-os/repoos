import XCTest
@testable import RepoOSHub

final class ServerSidebarRowLayoutTests: XCTestCase {
    func testMinimumRowWidthReservesLeadingChromeAndNameOnly() {
        let minimum = ServerSidebarRowLayout.minimumRowWidth()
        XCTAssertEqual(
            minimum,
            ServerSidebarRowLayout.leadingChromeWidth() + ServerSidebarRowLayout.minimumNameWidth
        )
    }

    func testBadgesWidthUsesInfoAffordanceWhenNoCounts() {
        let width = ServerSidebarRowLayout.badgesWidth(snapshot: nil)
        XCTAssertEqual(width, 14)
    }

    func testBadgesWidthGrowsWithMultipleBadges() {
        let one = ServerSidebarRowLayout.badgesWidth(snapshot: snapshot(review: 2))
        let three = ServerSidebarRowLayout.badgesWidth(snapshot: snapshot(review: 2, needsInput: 1, activeAgents: 3))
        XCTAssertGreaterThan(three, one)
    }

    func testMinimumRowWidthIgnoresBadgeWidth() {
        let manyBadges = ServerSidebarRowLayout.badgesWidth(
            snapshot: snapshot(review: 10, needsInput: 10, activeAgents: 10)
        )
        XCTAssertGreaterThan(manyBadges, ServerSidebarRowLayout.badgesWidth(snapshot: nil))
        XCTAssertEqual(
            ServerSidebarRowLayout.minimumRowWidth(),
            ServerSidebarRowLayout.leadingChromeWidth() + ServerSidebarRowLayout.minimumNameWidth
        )
    }

    private func snapshot(review: Int = 0, needsInput: Int = 0, activeAgents: Int = 0) -> ServerAttentionSnapshot {
        ServerAttentionSnapshot(
            serverID: UUID(),
            freshness: .fresh,
            counts: HubAttentionCounts(
                activeAgents: activeAgents,
                reviewReadyTasks: review,
                needsInputTasks: needsInput
            ),
            fetchedAt: Date(),
            lastError: nil,
            hasCapability: true
        )
    }
}
