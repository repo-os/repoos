import XCTest
@testable import RepoOSHub

final class ReachabilityStateTests: XCTestCase {
    func testSuccessMarksHealthy() {
        var entry = ServerEntry(name: "Local", origin: URL(string: "https://local.test")!)
        entry.lastHealth = .unknown
        ReachabilityTransition.applyHealthCheck(to: &entry, outcome: .success(projectName: nil))
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

    func testSidebarHoverDescribesServerAndIconStatus() {
        let checkedAt = Date(timeIntervalSinceReferenceDate: 100)
        let entry = ServerEntry(
            name: "Planning",
            repositoryName: "planning-repo",
            origin: URL(string: "https://planning.example")!,
            lastHealth: .healthy,
            lastHealthAt: checkedAt
        )

        let tooltip = ServerSidebarStatus.tooltip(for: entry, now: checkedAt)

        XCTAssertTrue(tooltip.contains("Server: Planning"))
        XCTAssertTrue(tooltip.contains("Repository: planning-repo"))
        XCTAssertTrue(tooltip.contains("Address: https://planning.example"))
        XCTAssertTrue(tooltip.contains("Status: Healthy (green)"))
        XCTAssertTrue(tooltip.contains("Icon colors: green = healthy"))
    }

    func testAccentColorNormalizesAndRejectsInvalidHex() {
        XCTAssertEqual(ServerAccentColor.normalizedHex(" #e07a8a "), "#E07A8A")
        XCTAssertNil(ServerAccentColor.normalizedHex("blue"))
        XCTAssertNil(ServerAccentColor.normalizedHex("#ABC"))
    }

    func testHealthPayloadCapturesRuntimeDetailsForServerCard() throws {
        let data = """
        {"ok":true,"projectName":"RepoOS","branch":"main","taskCount":42,"version":"0.5.50","buildAt":"2026-09-22T02:38:48.398Z","serverStartedAt":"2026-09-22T02:38:50.440Z"}
        """.data(using: .utf8)!
        let payload = try JSONDecoder().decode(HealthResponsePayload.self, from: data)
        let info = ServerRuntimeInfo(payload: payload)

        XCTAssertEqual(info.branch, "main")
        XCTAssertEqual(info.taskCount, 42)
        XCTAssertEqual(info.version, "0.5.50")
        XCTAssertNotNil(info.buildAt)
        XCTAssertNotNil(info.startedAt)
    }
}
