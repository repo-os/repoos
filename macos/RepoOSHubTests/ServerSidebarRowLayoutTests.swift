import XCTest
@testable import RepoOSHub

final class ServerSidebarRowLayoutTests: XCTestCase {
    func testWideRowUsesStandardLayout() {
        let badgesWidth = ServerSidebarRowLayout.badgesWidth(snapshot: snapshot(review: 2, needsInput: 1))
        let minimum = ServerSidebarRowLayout.standardLayoutMinimumWidth(badgesWidth: badgesWidth)
        let form = ServerSidebarRowLayout.layoutForm(
            availableWidth: minimum + 20,
            badgesWidth: badgesWidth
        )
        XCTAssertEqual(form, .standard)
    }

    func testNarrowRowUsesCompactLayout() {
        let badgesWidth = ServerSidebarRowLayout.badgesWidth(snapshot: snapshot(review: 2, needsInput: 1))
        let minimum = ServerSidebarRowLayout.standardLayoutMinimumWidth(badgesWidth: badgesWidth)
        let form = ServerSidebarRowLayout.layoutForm(
            availableWidth: minimum - 20,
            badgesWidth: badgesWidth
        )
        XCTAssertEqual(form, .compact)
    }

    func testHysteresisKeepsCompactUntilWideEnough() {
        let badgesWidth: CGFloat = 40
        let minimum = ServerSidebarRowLayout.standardLayoutMinimumWidth(badgesWidth: badgesWidth)
        let justBelowMinimum = minimum - 1
        XCTAssertEqual(
            ServerSidebarRowLayout.layoutForm(
                availableWidth: justBelowMinimum,
                badgesWidth: badgesWidth,
                previousForm: .compact
            ),
            .compact
        )
        XCTAssertEqual(
            ServerSidebarRowLayout.layoutForm(
                availableWidth: minimum + ServerSidebarRowLayout.decisionHysteresis - 1,
                badgesWidth: badgesWidth,
                previousForm: .compact
            ),
            .compact
        )
        XCTAssertEqual(
            ServerSidebarRowLayout.layoutForm(
                availableWidth: minimum + ServerSidebarRowLayout.decisionHysteresis,
                badgesWidth: badgesWidth,
                previousForm: .compact
            ),
            .standard
        )
    }

    func testBadgeDigitChangeWithinHysteresisDoesNotFlipStandardLayout() {
        let narrowBadge = ServerSidebarRowLayout.badgesWidth(snapshot: snapshot(review: 9))
        let wideBadge = ServerSidebarRowLayout.badgesWidth(snapshot: snapshot(review: 10))
        XCTAssertGreaterThan(wideBadge, narrowBadge)

        let availableWidth = ServerSidebarRowLayout.standardLayoutMinimumWidth(badgesWidth: narrowBadge) - 4
        XCTAssertEqual(
            ServerSidebarRowLayout.layoutForm(
                availableWidth: availableWidth,
                badgesWidth: wideBadge,
                previousForm: .standard
            ),
            .standard
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
