import XCTest
@testable import RepoOSHub

final class ReachabilityStateTests: XCTestCase {
    func testSuccessMarksHealthy() {
        var entry = ServerEntry(name: "Local", origin: URL(string: "https://local.test")!)
        entry.lastHealth = .unknown
        ReachabilityTransition.applyHealthCheck(to: &entry, outcome: .success)
        XCTAssertEqual(entry.lastHealth, .healthy)
        XCTAssertNotNil(entry.lastHealthAt)
    }

    func testNetworkFailureMarksUnreachableWithoutDeletingEntry() {
        var entry = ServerEntry(name: "Local", origin: URL(string: "https://local.test")!, lastHealth: .healthy)
        ReachabilityTransition.applyHealthCheck(to: &entry, outcome: .failure(.timeout))
        XCTAssertEqual(entry.lastHealth, .unreachable)
        XCTAssertEqual(entry.name, "Local")
    }

    func testInvalidHealthPayloadMarksInvalid() {
        var entry = ServerEntry(name: "Local", origin: URL(string: "https://local.test")!)
        ReachabilityTransition.applyHealthCheck(to: &entry, outcome: .failure(.notRepoOS))
        XCTAssertEqual(entry.lastHealth, .invalid)
    }
}
