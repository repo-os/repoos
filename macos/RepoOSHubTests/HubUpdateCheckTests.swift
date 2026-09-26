import XCTest
@testable import RepoOSHub

final class HubUpdateCheckTests: XCTestCase {
    func testNumericComparisonOrdersMultiDigitMinor() {
        XCTAssertEqual(HubUpdateCheck.compareVersions("1.10.0", "1.9.0"), 1)
        XCTAssertEqual(HubUpdateCheck.compareVersions("1.9.0", "1.10.0"), -1)
        XCTAssertEqual(HubUpdateCheck.compareVersions("2.0.0", "2.0.0"), 0)
    }

    func testStripsLeadingV() {
        XCTAssertEqual(HubUpdateCheck.compareVersions("v1.10.0", "1.9.0"), 1)
    }

    func testRejectsNonNumericVersions() {
        XCTAssertNil(HubUpdateCheck.compareVersions("latest", "1.9.0"))
        XCTAssertNil(HubUpdateCheck.compareVersions("1.9", "1.9.0"))
    }

    func testOnlyStableReleasesOffered() {
        XCTAssertFalse(HubUpdateCheck.isStableTag("v1.2.3", prerelease: true))
        XCTAssertFalse(HubUpdateCheck.isStableTag("nightly", prerelease: false))
        XCTAssertTrue(HubUpdateCheck.isStableTag("v1.2.3", prerelease: false))
        XCTAssertTrue(HubUpdateCheck.isStableTag("1.2.3", prerelease: nil))
    }

    func testUpToDateResult() {
        let result = HubUpdateCheck.evaluate(tag: "v1.2.0", prerelease: false, currentVersion: "1.2.0")
        XCTAssertEqual(result, .upToDate(current: "1.2.0", latest: "1.2.0"))
    }

    func testAvailableResult() {
        let result = HubUpdateCheck.evaluate(tag: "v1.10.0", prerelease: false, currentVersion: "1.9.0")
        XCTAssertEqual(result, .available(current: "1.9.0", latest: "1.10.0"))
    }

    func testPrereleaseNeverOffered() {
        let result = HubUpdateCheck.evaluate(tag: "v9.9.9", prerelease: true, currentVersion: "1.0.0")
        XCTAssertEqual(result, .couldNotCheck(reason: "Could not determine the latest Hub version."))
    }

    func testMalformedResponseIsCouldNotCheck() {
        XCTAssertNil(HubUpdatePayloadParsing.parse(data: Data("<html>oops</html>".utf8)))
        let result = HubUpdateCheck.evaluate(tag: nil, prerelease: nil, currentVersion: "1.0.0")
        XCTAssertEqual(result, .couldNotCheck(reason: "Could not determine the latest Hub version."))
    }

    func testCheckerCachesForSixHoursUnlessForced() async {
        let fetcher = CountingFetcher(payload: #"{"tag_name":"v2.0.0","prerelease":false}"#)
        let checker = HubUpdateChecker(fetcher: fetcher)
        let first = await checker.check(currentVersion: "1.0.0")
        XCTAssertEqual(first, .available(current: "1.0.0", latest: "2.0.0"))
        let second = await checker.check(currentVersion: "1.0.0")
        XCTAssertEqual(second, first)
        XCTAssertEqual(fetcher.calls, 1)
        _ = await checker.check(currentVersion: "1.0.0", force: true)
        XCTAssertEqual(fetcher.calls, 2)
    }

    func testCheckerSurfacesTransportFailureAsCouldNotCheck() async {
        let checker = HubUpdateChecker(fetcher: FailingFetcher())
        let result = await checker.check(currentVersion: "1.0.0")
        if case .couldNotCheck = result { return }
        XCTFail("expected couldNotCheck, got \(result)")
    }

    func testFailedCheckNeverReportsUpdate() async {
        let checker = HubUpdateChecker(fetcher: HTMLFetcher())
        let result = await checker.check(currentVersion: "1.0.0")
        if case .available = result {
            XCTFail("a failed check must never report an update")
        }
    }
}

private final class CountingFetcher: HubUpdateFetching, @unchecked Sendable {
    private let lock = NSLock()
    private(set) var calls = 0
    private let payload: String

    init(payload: String) { self.payload = payload }

    func fetchLatestRelease() async -> (data: Data?, statusCode: Int?) {
        lock.lock()
        calls += 1
        lock.unlock()
        return (Data(payload.utf8), 200)
    }
}

private struct FailingFetcher: HubUpdateFetching {
    func fetchLatestRelease() async -> (data: Data?, statusCode: Int?) { (nil, nil) }
}

private struct HTMLFetcher: HubUpdateFetching {
    func fetchLatestRelease() async -> (data: Data?, statusCode: Int?) {
        (Data("<html>rate limited</html>".utf8), 200)
    }
}
