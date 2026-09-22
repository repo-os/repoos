import XCTest
@testable import RepoOSHub

final class HubTaskSearchRoutingTests: XCTestCase {
    func testRemoteTaskSelectionUsesWorkDeepLink() {
        XCTAssertEqual(HubTaskSearchRouting.routePath(taskID: "0476"), "/work?task=0476")
    }

    func testPaletteActionOpensSelectedServerRoute() {
        let serverID = UUID()
        let action = CommandPaletteAction.openRemoteTask(serverID: serverID, path: "/work?task=0476")
        XCTAssertEqual(action, .openRemoteTask(serverID: serverID, path: "/work?task=0476"))
    }
}
