import XCTest
@testable import RepoOSHub

final class HubAttentionFreshnessTests: XCTestCase {
    func testMissingCapabilityIsUnavailable() {
        let freshness = HubAttentionFreshness.classify(
            fetchedAt: Date(),
            lastError: nil,
            hasCapability: false,
            isSelected: true,
            now: Date()
        )
        XCTAssertEqual(freshness, .unavailable)
    }

    func testRecentFetchIsFreshForSelectedServer() {
        let now = Date()
        let fetched = now.addingTimeInterval(-30)
        let freshness = HubAttentionFreshness.classify(
            fetchedAt: fetched,
            lastError: nil,
            hasCapability: true,
            isSelected: true,
            now: now
        )
        XCTAssertEqual(freshness, .fresh)
    }

    func testOldFetchIsStale() {
        let now = Date()
        let fetched = now.addingTimeInterval(-200)
        let freshness = HubAttentionFreshness.classify(
            fetchedAt: fetched,
            lastError: nil,
            hasCapability: true,
            isSelected: true,
            now: now
        )
        XCTAssertEqual(freshness, .stale)
    }

    func testUnauthorizedSummaryIsUnavailable() {
        let now = Date()
        let freshness = HubAttentionFreshness.classify(
            fetchedAt: now.addingTimeInterval(-10),
            lastError: .unauthorized,
            hasCapability: true,
            isSelected: false,
            now: now
        )
        XCTAssertEqual(freshness, .unavailable)
    }
}
