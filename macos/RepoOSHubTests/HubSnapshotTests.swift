import AppKit
import SwiftUI
import XCTest
@testable import RepoOSHub

/// Offscreen PNG snapshots of the Hub views that change most often (#0893):
/// the native sidebar, the server summary (details) popover, and the Tabs-mode
/// top bar.
///
/// The suite only runs when `HUB_SNAPSHOT_DIR` is set, so the normal
/// `xcodebuild test` run is unchanged. It renders `NSHostingView`s into bitmaps
/// and never shows or orders a window front. The sidebar's AppKit-backed
/// `List` gets an offscreen host window that is never ordered front or made
/// key, purely so its rows lay out. That means a shot proves the view's
/// content and layout, not how a real window sizes or ornaments it — use an
/// XCUITest with `XCTAttachment` when the window frame/chrome itself is the
/// question.
@MainActor
final class HubSnapshotTests: XCTestCase {
    func testSidebarSnapshot() throws {
        let fixture = try makeFixture(entries: sidebarEntries(), layout: .sidebar)
        defer { fixture.cleanup() }
        XCTAssertEqual(fixture.state.entries.count, 4, "the snapshot fixture should populate the sidebar")

        try capture("hub-sidebar", size: CGSize(width: 260, height: 620)) { appearance in
            fixture.state.updateHubAppearance(appearance == .darkAqua ? .dark : .light)
            return AnyView(
                ServerSidebarView(columnVisibility: .constant(.all))
                    .environmentObject(fixture.state)
            )
        }
    }

    func testSummarySnapshot() throws {
        let entry = ServerEntry(
            name: "RepoOS",
            repositoryName: "repoos",
            origin: URL(string: "https://repoos.example.test")!,
            lastHealth: .healthy,
            lastHealthAt: Date(timeIntervalSince1970: 1_790_000_000),
            accentColorHex: "#2F6FEB",
            attentionAggregationEnabled: false
        )
        let attention = ServerAttentionSnapshot(
            serverID: entry.id,
            freshness: .fresh,
            counts: HubAttentionCounts(activeAgents: 1, reviewReadyTasks: 2, needsInputTasks: 3),
            fetchedAt: Date(timeIntervalSince1970: 1_790_000_030),
            lastError: nil,
            hasCapability: true
        )

        try capture("hub-summary", size: CGSize(width: 350, height: 390)) { _ in
            AnyView(
                VStack(spacing: 0) {
                    ServerDetailsPopover(
                        entry: entry,
                        runtimeInfo: ServerRuntimeInfo(
                            payload: HealthResponsePayload(
                                ok: true,
                                projectName: "RepoOS",
                                root: "/Users/nick/code/repoos",
                                branch: "main",
                                taskCount: 128,
                                version: "0.94.1",
                                buildAt: "2026-10-23T12:00:00.000Z",
                                serverStartedAt: "2026-10-23T16:00:00.000Z"
                            )
                        ),
                        attention: attention
                    )
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(nsColor: .windowBackgroundColor))
            )
        }
    }

    func testTabsTopBarSnapshot() throws {
        let fixture = try makeFixture(entries: tabEntries(), layout: .tabs)
        defer { fixture.cleanup() }

        try capture(
            "hub-tabs-top-bar",
            size: CGSize(width: 900, height: HubServerTabStripMetrics.height)
        ) { appearance in
            fixture.state.updateHubAppearance(appearance == .darkAqua ? .dark : .light)
            return AnyView(HubServerTabStrip().environmentObject(fixture.state))
        }
    }

    func testTabsTopBarHoverSnapshot() throws {
        let fixture = try makeFixture(entries: tabEntries(), layout: .tabs)
        defer { fixture.cleanup() }
        let hoveredID = try XCTUnwrap(fixture.state.visibleServerTabEntries.dropFirst().first?.id)

        try capture("hub-tabs-top-bar-hover", size: CGSize(width: 900, height: HubServerTabStripMetrics.height)) { appearance in
            fixture.state.updateHubAppearance(appearance == .darkAqua ? .dark : .light)
            return AnyView(
                HubServerTabStrip(snapshotHoverEntryID: hoveredID)
                    .environmentObject(fixture.state)
            )
        }
    }

    func testTabsTopBarChevronHoverSnapshot() throws {
        let fixture = try makeFixture(entries: tabEntries(), layout: .tabs)
        defer { fixture.cleanup() }

        try capture("hub-tabs-top-bar-chevron-hover", size: CGSize(width: 900, height: HubServerTabStripMetrics.height)) { appearance in
            fixture.state.updateHubAppearance(appearance == .darkAqua ? .dark : .light)
            return AnyView(
                HubServerTabStrip(snapshotChevronHover: true)
                    .environmentObject(fixture.state)
            )
        }
    }

    func testTabsTopBarStatusPopupSnapshot() throws {
        let fixture = try makeFixture(entries: tabEntries(), layout: .tabs)
        defer { fixture.cleanup() }
        var entry = try XCTUnwrap(fixture.state.visibleServerTabEntries.first)
        entry.repositoryName = "repoos"
        let attention = ServerAttentionSnapshot(
            serverID: entry.id,
            freshness: .fresh,
            counts: HubAttentionCounts(activeAgents: 2, reviewReadyTasks: 4, needsInputTasks: 3),
            fetchedAt: Date(timeIntervalSince1970: 1_792_000_000),
            lastError: nil,
            hasCapability: true
        )
        let runtime = ServerRuntimeInfo(
            payload: HealthResponsePayload(
                ok: true,
                projectName: "RepoOS",
                root: "/Users/nick/code/repoos",
                branch: "main",
                taskCount: 128,
                version: "0.94.1",
                buildAt: "2026-10-23T12:00:00.000Z",
                serverStartedAt: "2026-10-23T16:00:00.000Z"
            )
        )

        try capture("hub-tabs-top-bar-status-popup", size: CGSize(width: 900, height: 500)) { appearance in
            fixture.state.updateHubAppearance(appearance == .darkAqua ? .dark : .light)
            return AnyView(
                ZStack(alignment: .topLeading) {
                    Color(nsColor: .windowBackgroundColor)
                    VStack(spacing: 0) {
                        HubServerTabStrip(snapshotHoverEntryID: entry.id)
                            .environmentObject(fixture.state)
                        Spacer(minLength: 0)
                    }
                    ServerDetailsPopover(entry: entry, runtimeInfo: runtime, attention: attention)
                        .padding(16)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .shadow(color: .black.opacity(0.18), radius: 14, y: 5)
                        .padding(.leading, 128)
                        .padding(.top, HubServerTabStripMetrics.height + 8)
                }
                .frame(width: 900, height: 500)
            )
        }
    }

    // MARK: - Capture

    private func capture(
        _ name: String,
        size: CGSize,
        content: @escaping (NSAppearance.Name) -> AnyView
    ) throws {
        guard let directory = HubSnapshotEnvironment.outputDirectory else {
            throw XCTSkip(
                "HUB_SNAPSHOT_DIR is not set; skipping Hub layout snapshots. Run macos/scripts/hub-snapshots.sh to render them."
            )
        }
        HubSnapshotEnvironment.validate(directory)

        for appearance in HubSnapshotEnvironment.appearances {
            let suffix = appearance == .darkAqua ? "dark" : "light"
            do {
                let rep = try HubSnapshotRenderer.render(
                    content(appearance),
                    size: size,
                    appearance: appearance,
                    name: "\(name)-\(suffix)"
                )
                try HubSnapshotRenderer.write(rep, name: "\(name)-\(suffix)", to: directory)
            } catch let error as HubSnapshotRenderer.RenderError {
                throw XCTSkip("Hub snapshots need a usable offscreen graphics context: \(error)")
            }
        }
    }

    // MARK: - Fixtures

    private struct Fixture {
        let state: HubAppState
        let directory: URL

        func cleanup() {
            try? FileManager.default.removeItem(at: directory)
        }
    }

    private func makeFixture(
        entries: [ServerEntry],
        layout: HubServerNavigationLayout
    ) throws -> Fixture {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("hub-snapshots-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let store = ServerRegistryStore(directoryURL: directory)
        var document = ServerRegistryDocument()
        for entry in entries {
            try store.upsertEntry(entry, in: &document)
        }
        document.lastSelectedServerID = entries.first?.id
        try store.save(document)

        let state = HubAppState(
            store: store,
            healthChecker: SnapshotStubHealthChecker(),
            attentionCoordinator: HubAttentionCoordinator()
        )
        state.updateServerNavigationLayout(layout)
        return Fixture(state: state, directory: directory)
    }

    private func sidebarEntries() -> [ServerEntry] {
        [
            ServerEntry(
                name: "RepoOS",
                repositoryName: "repoos",
                origin: URL(string: "https://repoos.example.test")!,
                lastHealth: .healthy,
                lastHealthAt: Date(timeIntervalSince1970: 1_790_000_000),
                sortOrder: 0,
                accentColorHex: "#2F6FEB",
                iconSymbolName: "chevron.left.forwardslash.chevron.right",
                isPinned: true,
                attentionAggregationEnabled: false
            ),
            ServerEntry(
                name: "Divot",
                repositoryName: "divot",
                origin: URL(string: "https://divot.example.test")!,
                lastHealth: .healthy,
                lastHealthAt: Date(timeIntervalSince1970: 1_790_000_000),
                sortOrder: 1,
                accentColorHex: "#B45309",
                groupName: "Desktop",
                attentionAggregationEnabled: false
            ),
            ServerEntry(
                name: "Landing",
                repositoryName: "landing",
                origin: URL(string: "https://landing.example.test")!,
                lastHealth: .unreachable,
                lastHealthAt: Date(timeIntervalSince1970: 1_789_999_000),
                sortOrder: 2,
                accentColorHex: "#0F766E",
                groupName: "Web",
                attentionAggregationEnabled: false
            ),
            ServerEntry(
                name: "flaky.test:7171",
                origin: URL(string: "http://flaky.test:7171")!,
                lastHealth: .invalid,
                sortOrder: 3,
                groupName: "Web",
                attentionAggregationEnabled: false
            ),
        ]
    }

    private func tabEntries() -> [ServerEntry] {
        [
            ServerEntry(
                name: "RepoOS",
                repositoryName: "repoos",
                origin: URL(string: "https://repoos.example.test")!,
                lastHealth: .healthy,
                lastHealthAt: Date(timeIntervalSince1970: 1_792_000_000),
                sortOrder: 0,
                accentColorHex: "#2F6FEB",
                attentionAggregationEnabled: false
            ),
            ServerEntry(
                name: "Divot",
                repositoryName: "divot",
                origin: URL(string: "https://divot.example.test")!,
                lastHealth: .healthy,
                lastHealthAt: Date(timeIntervalSince1970: 1_792_000_000),
                sortOrder: 1,
                accentColorHex: "#B45309",
                attentionAggregationEnabled: false
            ),
            ServerEntry(
                name: "Landing",
                repositoryName: "landing",
                origin: URL(string: "https://landing.example.test")!,
                lastHealth: .unreachable,
                lastHealthAt: Date(timeIntervalSince1970: 1_792_000_000),
                sortOrder: 2,
                accentColorHex: "#0F766E",
                attentionAggregationEnabled: false
            ),
        ]
    }
}

private struct SnapshotStubHealthChecker: HealthChecking {
    func checkHealth(origin: URL) async -> HealthCheckOutcome {
        .success(projectName: nil)
    }
}
