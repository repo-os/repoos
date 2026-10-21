import AppKit
import XCTest
@testable import RepoOSHub

final class ServerSidebarRowLayoutTests: XCTestCase {
    func testMinimumRowWidthReservesLeadingChromeAndNameOnly() {
        let minimum = ServerSidebarRowLayout.minimumRowWidth()
        XCTAssertEqual(
            minimum,
            ServerSidebarRowLayout.leadingChromeWidth() + ServerSidebarRowLayout.minimumNameWidth
        )
    }

    func testBadgesWidthUsesInfoAffordanceWhenNoCounts() {
        let width = ServerSidebarRowLayout.badgesWidth(snapshot: nil)
        XCTAssertEqual(width, 14)
    }

    func testBadgesWidthGrowsWithMultipleBadges() {
        let one = ServerSidebarRowLayout.badgesWidth(snapshot: snapshot(review: 2))
        let three = ServerSidebarRowLayout.badgesWidth(snapshot: snapshot(review: 2, needsInput: 1, activeAgents: 3))
        XCTAssertGreaterThan(three, one)
    }

    func testMinimumRowWidthIgnoresBadgeWidth() {
        let manyBadges = ServerSidebarRowLayout.badgesWidth(
            snapshot: snapshot(review: 10, needsInput: 10, activeAgents: 10)
        )
        XCTAssertGreaterThan(manyBadges, ServerSidebarRowLayout.badgesWidth(snapshot: nil))
        XCTAssertEqual(
            ServerSidebarRowLayout.minimumRowWidth(),
            ServerSidebarRowLayout.leadingChromeWidth() + ServerSidebarRowLayout.minimumNameWidth
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

/// #0892: Copy URL lives in the server context menu for both local and remote
/// servers, and the menu is described by a pure model so its contents and
/// ordering are testable without mounting SwiftUI.
final class ServerActionsMenuModelTests: XCTestCase {
    func testLocalServerMenuCopiesTheExactStoredURL() {
        let entry = serverEntry(
            origin: "http://localhost:7171",
            localProjectPath: "/Users/nick/code/nick/repoos",
            health: .healthy
        )

        let sections = ServerActionsMenuModel.sections(for: entry)
        let serverItems = sections[0].items

        XCTAssertEqual(
            serverItems.map(\.title),
            ["Notifications…", "Pin task…", "Pin server", "Copy URL", "Edit server…"]
        )
        XCTAssertEqual(serverItems.map(\.action)[3], .copyURL("http://localhost:7171"))
        XCTAssertEqual(serverItems[3].systemImage, "doc.on.doc")
    }

    func testRemoteServerMenuCopiesTheExactStoredURLAndOmitsLocalService() {
        let entry = serverEntry(origin: "https://hub.example.com:8443")

        let sections = ServerActionsMenuModel.sections(for: entry)

        XCTAssertEqual(sections.count, 2)
        XCTAssertEqual(
            sections[0].items.first(where: { $0.title == "Copy URL" })?.action,
            .copyURL("https://hub.example.com:8443")
        )
        XCTAssertFalse(sections.flatMap(\.items).contains { $0.action == .startLocalService })
    }

    func testCopyURLOmittedWhenTheStoredOriginIsInvalid() {
        var entry = serverEntry(origin: "https://hub.example.com")
        entry.originString = ""

        XCTAssertFalse(
            ServerActionsMenuModel.sections(for: entry)
                .flatMap(\.items)
                .contains { $0.title == "Copy URL" }
        )

        entry.originString = "   "
        XCTAssertNil(entry.copyableOriginString)

        entry.originString = "not a url"
        XCTAssertNil(entry.copyableOriginString)
    }

    func testPinnedServerOffersUnpin() {
        var entry = serverEntry(origin: "https://hub.example.com")
        entry.isPinned = true

        let titles = ServerActionsMenuModel.sections(for: entry)[0].items.map(\.title)
        XCTAssertTrue(titles.contains("Unpin server"))
        XCTAssertFalse(titles.contains("Pin server"))
    }

    func testLocalServiceSectionTracksHealth() {
        let offline = serverEntry(
            origin: "http://localhost:7171",
            localProjectPath: "/tmp/repo",
            health: .unreachable
        )
        let online = serverEntry(
            origin: "http://localhost:7171",
            localProjectPath: "/tmp/repo",
            health: .healthy
        )

        XCTAssertEqual(
            ServerActionsMenuModel.sections(for: offline)[1].items.map(\.action),
            [.startLocalService]
        )
        XCTAssertEqual(
            ServerActionsMenuModel.sections(for: online)[1].items.map(\.action),
            [.stopLocalService, .restartLocalService]
        )
    }

    func testRemoveIsDestructiveAndLast() {
        let entry = serverEntry(origin: "https://hub.example.com")
        let remove = ServerActionsMenuModel.sections(for: entry).last?.items.last

        XCTAssertEqual(remove?.action, .remove)
        XCTAssertEqual(remove?.title, "Remove server")
        XCTAssertEqual(remove?.isDestructive, true)
    }

    func testCopyURLWritesTheExactStringToAPasteboard() {
        let pasteboard = NSPasteboard(name: NSPasteboard.Name("repoos-hub-tests-\(UUID().uuidString)"))
        defer { pasteboard.releaseGlobally() }

        ServerClipboard.copy("http://localhost:7559", to: pasteboard)

        XCTAssertEqual(pasteboard.string(forType: .string), "http://localhost:7559")
    }

    private func serverEntry(
        origin: String,
        localProjectPath: String? = nil,
        health: HealthState = .healthy
    ) -> ServerEntry {
        ServerEntry(
            name: "Lighting AI",
            origin: URL(string: origin)!,
            lastHealth: health,
            localProjectPath: localProjectPath
        )
    }
}

/// #0892: the Hub reads the web UI's per-browser repo color from one named
/// first-party cookie, including an explicit Default marker.
final class RepoAccentColorPreferenceTests: XCTestCase {
    func testParsesARepoScopedColor() {
        XCTAssertEqual(
            RepoAccentColorPreference.parseCookieValue("lightingai%3A%23ffffba"),
            .color("#FFFFBA")
        )
    }

    func testParsesABareLegacyColor() {
        XCTAssertEqual(
            RepoAccentColorPreference.parseCookieValue("#9E8FD0"),
            .color("#9E8FD0")
        )
    }

    func testEmptyColorIsAnExplicitDefault() {
        XCTAssertEqual(RepoAccentColorPreference.parseCookieValue("lightingai%3A"), .cleared)
        XCTAssertEqual(RepoAccentColorPreference.parseCookieValue("lightingai%3Anone"), .cleared)
    }

    func testMalformedValueIsIgnoredSoItCannotClearACachedColor() {
        XCTAssertEqual(RepoAccentColorPreference.parseCookieValue("lightingai%3Ayellow"), .unsupported)
        XCTAssertEqual(RepoAccentColorPreference.parseCookieValue("not-a-color"), .unsupported)
    }

    func testMatchesOnlyTheCurrentOriginHost() {
        XCTAssertTrue(
            RepoAccentColorPreference.cookieMatches(domain: "localhost", host: "localhost")
        )
        XCTAssertTrue(
            RepoAccentColorPreference.cookieMatches(domain: ".localhost", host: "LOCALHOST")
        )
        // A cookie left in the store by a previous origin must not paint the row.
        XCTAssertFalse(
            RepoAccentColorPreference.cookieMatches(domain: "127.0.0.1", host: "localhost")
        )
        XCTAssertFalse(
            RepoAccentColorPreference.cookieMatches(domain: "hub.example.com", host: "other.example.com")
        )
    }

    func testScopesThePreferenceToTheRepoThatChoseIt() {
        XCTAssertEqual(
            RepoAccentColorPreference.parseCookieValue(
                "lightingai%3A%23ffffba",
                expectedRepoName: "LightingAI"
            ),
            .color("#FFFFBA")
        )
        // A server that now serves a different repo must not inherit the color.
        XCTAssertEqual(
            RepoAccentColorPreference.parseCookieValue(
                "lightingai%3A%23ffffba",
                expectedRepoName: "repoos"
            ),
            .unsupported
        )
        // Before health reports a repo name, and for a legacy bare color, accept.
        XCTAssertEqual(
            RepoAccentColorPreference.parseCookieValue(
                "lightingai%3A%23ffffba",
                expectedRepoName: nil
            ),
            .color("#FFFFBA")
        )
        XCTAssertEqual(
            RepoAccentColorPreference.parseCookieValue("#9E8FD0", expectedRepoName: "repoos"),
            .color("#9E8FD0")
        )
    }
}
