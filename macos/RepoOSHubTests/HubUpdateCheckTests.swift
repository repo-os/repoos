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
        XCTAssertEqual(result, .available(current: "1.9.0", latest: "1.10.0", downloadURL: nil))
    }

    func testAvailableCarriesDmgDownloadURL() {
        let url = URL(string: "https://github.com/repo-os/repoos/releases/download/v2.0.0/RepoOSHub.dmg")!
        let result = HubUpdateCheck.evaluate(tag: "v2.0.0", prerelease: false, currentVersion: "1.0.0", dmgDownloadURL: url)
        XCTAssertEqual(result, .available(current: "1.0.0", latest: "2.0.0", downloadURL: url))
        XCTAssertEqual(result.downloadURL, url)
    }

    func testAvailableWithoutDmgAssetOffersReleasesPageOnly() {
        let json = #"{"tag_name":"v2.0.0","prerelease":false,"assets":[]}"#
        let payload = HubUpdatePayloadParsing.parse(data: Data(json.utf8))
        XCTAssertNotNil(payload)
        XCTAssertNil(payload?.dmgDownloadURL)
        let result = HubUpdateCheck.evaluate(tag: payload?.tag, prerelease: payload?.prerelease, currentVersion: "1.0.0", dmgDownloadURL: payload?.dmgDownloadURL)
        XCTAssertEqual(result, .available(current: "1.0.0", latest: "2.0.0", downloadURL: nil))
        XCTAssertNil(result.downloadURL)
    }

    func testDmgAssetURLParsedFromPayload() {
        let json = #"{"tag_name":"v2.0.0","prerelease":false,"assets":[{"name":"RepoOSHub.dmg","browser_download_url":"https://github.com/repo-os/repoos/releases/download/v2.0.0/RepoOSHub.dmg"},{"name":"notes.txt","browser_download_url":"https://example.com/notes.txt"}]}"#
        let payload = HubUpdatePayloadParsing.parse(data: Data(json.utf8))
        XCTAssertEqual(payload?.dmgDownloadURL?.absoluteString, "https://github.com/repo-os/repoos/releases/download/v2.0.0/RepoOSHub.dmg")
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
        XCTAssertEqual(first, .available(current: "1.0.0", latest: "2.0.0", downloadURL: nil))
        let second = await checker.check(currentVersion: "1.0.0")
        XCTAssertEqual(second, first)
        let callsAfterCache = await fetcher.calls
        XCTAssertEqual(callsAfterCache, 1)
        _ = await checker.check(currentVersion: "1.0.0", force: true)
        let callsAfterForce = await fetcher.calls
        XCTAssertEqual(callsAfterForce, 2)
    }

    func testCachedResultServesWithoutNetwork() async {
        let fetcher = CountingFetcher(payload: #"{"tag_name":"v2.0.0","prerelease":false}"#)
        let checker = HubUpdateChecker(fetcher: fetcher)
        let empty = await checker.cachedResult()
        XCTAssertNil(empty)
        _ = await checker.check(currentVersion: "1.0.0")
        let served = await checker.cachedResult()
        XCTAssertEqual(served, .available(current: "1.0.0", latest: "2.0.0", downloadURL: nil))
        let servedCalls = await fetcher.calls
        XCTAssertEqual(servedCalls, 1)
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

private actor CountingFetcher: HubUpdateFetching {
    private(set) var calls = 0
    private let payload: String

    init(payload: String) { self.payload = payload }

    func fetchLatestRelease() async -> (data: Data?, statusCode: Int?) {
        calls += 1
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
