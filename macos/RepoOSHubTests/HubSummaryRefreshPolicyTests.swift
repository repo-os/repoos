import XCTest
@testable import RepoOSHub

final class HubSummaryRefreshPolicyTests: XCTestCase {
    func testSelectedServerUsesShorterBaseInterval() {
        let policy = HubSummaryRefreshPolicy()
        XCTAssertEqual(policy.nextDelay(isSelected: true), 30)
        XCTAssertEqual(policy.nextDelay(isSelected: false), 120)
    }

    func testBackoffGrowsWithFailuresAndCapsAtFifteenMinutes() {
        var policy = HubSummaryRefreshPolicy(consecutiveFailures: 0)
        XCTAssertEqual(policy.nextDelay(isSelected: false), 120)

        policy = policy.afterFailure()
        XCTAssertEqual(policy.nextDelay(isSelected: false), 120)

        policy = policy.afterFailure()
        XCTAssertEqual(policy.nextDelay(isSelected: false), 240)

        policy = HubSummaryRefreshPolicy(consecutiveFailures: 10)
        XCTAssertEqual(policy.nextDelay(isSelected: false), HubSummaryRefreshPolicy.maxInterval)
    }

    func testSuccessResetsBackoff() {
        let failed = HubSummaryRefreshPolicy(consecutiveFailures: 4).afterFailure()
        XCTAssertGreaterThan(failed.nextDelay(isSelected: true), HubSummaryRefreshPolicy.selectedBaseInterval)
        XCTAssertEqual(failed.afterSuccess().nextDelay(isSelected: true), HubSummaryRefreshPolicy.selectedBaseInterval)
    }

    func testScheduledSlotAdvancesAfterAttempt() {
        let now = Date(timeIntervalSince1970: 1_000)
        let slot = HubSummaryRefreshSlot.initial(isSelected: false, now: now)
        let next = slot.scheduledAfterAttempt(isSelected: false, succeeded: false, now: now)
        XCTAssertGreaterThan(next.nextFireAt, now)
        XCTAssertEqual(next.policy.consecutiveFailures, 1)
    }
}
