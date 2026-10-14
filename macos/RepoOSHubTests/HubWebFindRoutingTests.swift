import XCTest
@testable import RepoOSHub

final class HubWebFindRoutingTests: XCTestCase {
    private let serverA = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
    private let serverB = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!

    func testFindNotificationTargetsOnlyItsServer() {
        let notification = Notification(
            name: .hubWebFindPresent,
            object: nil,
            userInfo: HubWebFindAction.userInfo(serverID: serverA, action: .present)
        )

        XCTAssertTrue(HubWebNavigationCommand.targets(notification, serverID: serverA))
        XCTAssertFalse(HubWebNavigationCommand.targets(notification, serverID: serverB))
        XCTAssertEqual(HubWebFindAction.action(from: notification), .present)
    }
}
