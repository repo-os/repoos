import XCTest

final class RepoOSHubTests: XCTestCase {
    func testScaffoldHasStableAppIdentity() throws {
        XCTAssertEqual(Bundle(for: Self.self).bundleIdentifier, "org.repoos.hub.tests")
    }
}
