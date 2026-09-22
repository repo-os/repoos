import XCTest
@testable import RepoOSHub

final class HubCrossServerTaskSearchTests: XCTestCase {
    @MainActor
    func testCancellationClearsInFlightSearch() async {
        let slow = SlowHubTaskSearchClient(delayNanoseconds: 2_000_000_000)
        let keychain = InMemoryHubCapabilityStore()
        let engine = HubCrossServerTaskSearchEngine(client: slow, keychain: keychain)
        let entry = makeEntry(searchEnabled: true)
        engine.configure(entries: [entry])
        try? keychain.saveToken(serverID: entry.id, origin: entry.originString, token: "roh_test")

        engine.scheduleSearch(query: "privacy")
        engine.cancel()

        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertFalse(engine.isSearching)
    }

    @MainActor
    func testUnauthorizedServerSurfacesIndependently() async {
        let client = StubHubTaskSearchClient(result: .failure(.unauthorized))
        let keychain = InMemoryHubCapabilityStore()
        let entry = makeEntry(searchEnabled: true)
        try? keychain.saveToken(serverID: entry.id, origin: entry.originString, token: "roh_test")
        let engine = HubCrossServerTaskSearchEngine(client: client, keychain: keychain)
        engine.configure(entries: [entry])

        engine.scheduleSearch(query: "privacy")
        try? await Task.sleep(nanoseconds: 800_000_000)

        XCTAssertEqual(engine.serverLines.first?.status, .unauthorized)
        XCTAssertTrue(engine.remoteResults.isEmpty)
    }

    private func makeEntry(searchEnabled: Bool) -> ServerEntry {
        ServerEntry(
            name: "Dev",
            origin: URL(string: "https://repoos.example.test")!,
            crossServerTaskSearchEnabled: searchEnabled
        )
    }
}

private final class StubHubTaskSearchClient: HubTaskSearchFetching, @unchecked Sendable {
    let result: Result<HubTaskSearchPayload, HubTaskSearchFetchFailure>

    init(result: Result<HubTaskSearchPayload, HubTaskSearchFetchFailure>) {
        self.result = result
    }

    func searchTasks(origin: URL, token: String?, query: String) async -> Result<HubTaskSearchPayload, HubTaskSearchFetchFailure> {
        result
    }
}

private final class SlowHubTaskSearchClient: HubTaskSearchFetching, @unchecked Sendable {
    let delayNanoseconds: UInt64

    init(delayNanoseconds: UInt64) {
        self.delayNanoseconds = delayNanoseconds
    }

    func searchTasks(origin: URL, token: String?, query: String) async -> Result<HubTaskSearchPayload, HubTaskSearchFetchFailure> {
        try? await Task.sleep(nanoseconds: delayNanoseconds)
        return .success(
            HubTaskSearchPayload(
                apiVersion: "v1",
                generatedAt: Date(),
                query: query,
                results: []
            )
        )
    }
}
