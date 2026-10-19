import XCTest
@testable import RepoOSHub

final class RunningServerRegistryDiscoveryTests: XCTestCase {
    private var tempDirectory: URL!

    override func setUpWithError() throws {
        tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("repoos-registry-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: tempDirectory)
    }

    func testDiscoverListsValidRegistryEntries() async throws {
        let root = tempDirectory.path
        try writeRegistry(
            port: 7559,
            pid: 42,
            root: root,
            projectName: "My Repo",
            in: tempDirectory
        )
        let checker = RegistryPortHealthChecker(
            responders: [
                7559: .success(projectName: "ignored", runtimeInfo: nil, projectPath: root),
            ]
        )
        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            healthChecker: checker,
            pidChecker: FakePidChecker(alive: [42]),
            registrySource: RunningServerRegistrySource(directoryURL: tempDirectory)
        )
        XCTAssertEqual(found.map(\.port), [7559])
        XCTAssertEqual(found.first?.projectName, "My Repo")
    }

    func testDiscoverSkipsDeadPid() async throws {
        try writeRegistry(port: 7600, pid: 99, root: "/tmp/x", projectName: "X", in: tempDirectory)
        let checker = RegistryPortHealthChecker(
            responders: [7600: .success(projectName: "X", runtimeInfo: nil, projectPath: "/tmp/x")]
        )
        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            healthChecker: checker,
            pidChecker: FakePidChecker(alive: []),
            registrySource: RunningServerRegistrySource(directoryURL: tempDirectory)
        )
        XCTAssertTrue(found.isEmpty)
    }

    func testDiscoverSkipsHealthRootMismatch() async throws {
        let root = tempDirectory.path
        try writeRegistry(port: 7610, pid: 7, root: root, projectName: "A", in: tempDirectory)
        let checker = RegistryPortHealthChecker(
            responders: [
                7610: .success(projectName: "A", runtimeInfo: nil, projectPath: "/other/root"),
            ]
        )
        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            healthChecker: checker,
            pidChecker: FakePidChecker(alive: [7]),
            registrySource: RunningServerRegistrySource(directoryURL: tempDirectory)
        )
        XCTAssertTrue(found.isEmpty)
    }

    func testDiscoverExcludesAlreadyAddedPortsFromRegistry() async throws {
        let root = tempDirectory.path
        try writeRegistry(port: 7171, pid: 1, root: root, projectName: "Main", in: tempDirectory)
        try writeRegistry(port: 7559, pid: 2, root: root, projectName: "Other", in: tempDirectory)
        let checker = RegistryPortHealthChecker(
            responders: [
                7171: .success(projectName: "Main", runtimeInfo: nil, projectPath: root),
                7559: .success(projectName: "Other", runtimeInfo: nil, projectPath: root),
            ]
        )
        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [7171],
            healthChecker: checker,
            pidChecker: FakePidChecker(alive: [1, 2]),
            registrySource: RunningServerRegistrySource(directoryURL: tempDirectory)
        )
        XCTAssertEqual(found.map(\.port), [7559])
    }

    func testDiscoverIgnoresMalformedAndUnknownSchemaFiles() async throws {
        let root = tempDirectory.path
        try writeRegistry(port: 7620, pid: 3, root: root, projectName: "Good", in: tempDirectory)
        try "not json".write(
            to: tempDirectory.appendingPathComponent("bad.json"),
            atomically: true,
            encoding: .utf8
        )
        let unknownSchema = """
        {"schema":99,"port":7621,"host":"127.0.0.1","pid":3,"root":"\(root)","projectName":"Nope","version":"0","startedAt":"2026-01-01T00:00:00Z","kind":"server"}
        """
        try unknownSchema.write(
            to: tempDirectory.appendingPathComponent("7621.json"),
            atomically: true,
            encoding: .utf8
        )
        let checker = RegistryPortHealthChecker(
            responders: [7620: .success(projectName: "Good", runtimeInfo: nil, projectPath: root)]
        )
        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            healthChecker: checker,
            pidChecker: FakePidChecker(alive: [3]),
            registrySource: RunningServerRegistrySource(directoryURL: tempDirectory)
        )
        XCTAssertEqual(found.map(\.port), [7620])
    }

    func testDiscoverFallsBackToScanWhenRegistryDirectoryMissing() async {
        let missing = tempDirectory.appendingPathComponent("no-such-dir", isDirectory: true)
        let checker = RegistryPortHealthChecker(
            responders: [7400: .success(projectName: "Scanned", runtimeInfo: nil, projectPath: nil)]
        )
        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            configuration: LocalServerDiscoveryConfiguration(overallDeadline: 2.0),
            healthChecker: checker,
            registrySource: RunningServerRegistrySource(directoryURL: missing),
            listeningPortEnumerator: { _ in [7400] }
        )
        XCTAssertEqual(found.map(\.port), [7400])
    }

    func testDiscoverFallsBackToScanWhenRegistryDirectoryEmpty() async throws {
        let checker = RegistryPortHealthChecker(
            responders: [7410: .success(projectName: "Scanned", runtimeInfo: nil, projectPath: nil)]
        )
        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            configuration: LocalServerDiscoveryConfiguration(overallDeadline: 2.0),
            healthChecker: checker,
            registrySource: RunningServerRegistrySource(directoryURL: tempDirectory),
            listeningPortEnumerator: { _ in [7410] }
        )
        XCTAssertEqual(found.map(\.port), [7410])
    }

    func testDiscoverShowsRegistryBeforeScanResults() async throws {
        let root = tempDirectory.path
        try writeRegistry(port: 7500, pid: 5, root: root, projectName: "Registry", in: tempDirectory)
        let checker = RegistryPortHealthChecker(
            responders: [
                7500: .success(projectName: "Registry", runtimeInfo: nil, projectPath: root),
                7505: .success(projectName: "Scan", runtimeInfo: nil, projectPath: nil),
            ]
        )
        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            configuration: LocalServerDiscoveryConfiguration(overallDeadline: 2.0),
            healthChecker: checker,
            pidChecker: FakePidChecker(alive: [5]),
            registrySource: RunningServerRegistrySource(directoryURL: tempDirectory),
            includePortScan: true,
            listeningPortEnumerator: { _ in [7505] }
        )
        XCTAssertEqual(found.map(\.port), [7500, 7505])
        XCTAssertEqual(found.map(\.displayName), ["Registry", "Scan"])
    }

    func testUnavailableRegistryDegradesToScanWithoutCrashing() async {
        let unreadable = FileManager.default.temporaryDirectory
            .appendingPathComponent("repoos-registry-unreadable-\(UUID().uuidString)", isDirectory: true)
        // Not a directory — listOutcome should be unavailable.
        try? "x".write(to: unreadable, atomically: true, encoding: .utf8)

        let checker = RegistryPortHealthChecker(
            responders: [7420: .success(projectName: "Fallback", runtimeInfo: nil, projectPath: nil)]
        )
        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            configuration: LocalServerDiscoveryConfiguration(overallDeadline: 2.0),
            healthChecker: checker,
            registrySource: RunningServerRegistrySource(directoryURL: unreadable),
            listeningPortEnumerator: { _ in [7420] }
        )
        XCTAssertEqual(found.map(\.port), [7420])
        try? FileManager.default.removeItem(at: unreadable)
    }

    // MARK: - Fixtures

    private func writeRegistry(
        port: Int,
        pid: Int32,
        root: String,
        projectName: String,
        in directory: URL
    ) throws {
        let escapedRoot = root.replacingOccurrences(of: "\\", with: "\\\\")
        let json = """
        {
          "schema": 1,
          "port": \(port),
          "host": "127.0.0.1",
          "pid": \(pid),
          "root": "\(escapedRoot)",
          "projectName": "\(projectName)",
          "version": "0.1.0",
          "startedAt": "2026-01-01T00:00:00.000Z",
          "kind": "server"
        }
        """
        try json.write(
            to: directory.appendingPathComponent("\(port).json"),
            atomically: true,
            encoding: .utf8
        )
    }
}

private struct FakePidChecker: ProcessAliveChecking {
    let alive: Set<Int32>

    func isAlive(pid: Int32) -> Bool {
        alive.contains(pid)
    }
}

private final class RegistryPortHealthChecker: HealthChecking, @unchecked Sendable {
    let responders: [Int: HealthCheckOutcome]

    init(responders: [Int: HealthCheckOutcome]) {
        self.responders = responders
    }

    func checkHealth(origin: URL) async -> HealthCheckOutcome {
        let port = origin.port ?? -1
        if let outcome = responders[port] {
            return outcome
        }
        return .failure(.network("refused"))
    }
}
