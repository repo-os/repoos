import XCTest
@testable import RepoOSHub

final class LocalServerDiscoveryTests: XCTestCase {
    func testListeningPortEnumeratorUsesLsofWhenAvailable() {
        let ports = LocalListeningPortEnumerator.listeningPorts(in: 7000 ... 7999)
        XCTAssertNotNil(ports, "lsof should be available on macOS CI and dev machines")
    }

    func testLiveDiscoveryFindsLocalRepoOSWhenServingOn7559() async throws {
        let origin = URL(string: "http://localhost:7559")!
        let probe = RepoOSHealthChecker(timeout: 1.25)
        guard case .success(let projectName, _, _) = await probe.checkHealth(origin: origin) else {
            throw XCTSkip("No RepoOS server on localhost:7559")
        }

        let found = await LocalServerDiscovery.discover(knownLocalPorts: [])
        let match = found.first { $0.port == 7559 }
        XCTAssertNotNil(match)
        XCTAssertEqual(match?.originString, "localhost:7559")
        if let projectName {
            XCTAssertEqual(match?.projectName, projectName)
        }
    }

    func testParseLsofFieldOutputExtractsPortsInRange() {
        let sample = """
        p1234
        n127.0.0.1:7171
        p5678
        n*:7559
        n[::1]:7845
        n127.0.0.1:6999
        n127.0.0.1:8000
        """
        let ports = LocalListeningPortEnumerator.parsePorts(
            from: Data(sample.utf8),
            in: 7000 ... 7999
        )
        XCTAssertEqual(ports, [7171, 7559, 7845])
    }

    func testDiscoverFindsServersUnderSimulatedLatency() async {
        let ports = Array(7000 ... 7099)
        let checker = LatencyTrackingHealthChecker(
            latency: .milliseconds(80),
            responders: [
                7010: .success(projectName: "Alpha", runtimeInfo: nil, projectPath: nil),
                7055: .success(projectName: "Beta", runtimeInfo: nil, projectPath: nil),
            ]
        )

        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            configuration: LocalServerDiscoveryConfiguration(
                maxConcurrency: 32,
                probeTimeout: 1.25,
                overallDeadline: 5.0
            ),
            healthChecker: checker,
            listeningPortEnumerator: { _ in nil },
            portsToProbe: ports
        )

        XCTAssertEqual(found.map(\.port), [7010, 7055])
        XCTAssertEqual(found.map(\.displayName), ["Alpha", "Beta"])
        XCTAssertLessThanOrEqual(checker.peakConcurrency(), 32)
        XCTAssertGreaterThan(checker.peakConcurrency(), 1)
    }

    func testDiscoverRespectsBoundedConcurrency() async {
        let ports = Array(7000 ... 7199)
        let checker = LatencyTrackingHealthChecker(
            latency: .milliseconds(50),
            responders: [7100: .success(projectName: "One", runtimeInfo: nil, projectPath: nil)]
        )

        _ = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            configuration: LocalServerDiscoveryConfiguration(
                maxConcurrency: 16,
                probeTimeout: 1.0,
                overallDeadline: 10.0
            ),
            healthChecker: checker,
            listeningPortEnumerator: { _ in nil },
            portsToProbe: ports
        )

        XCTAssertLessThanOrEqual(checker.peakConcurrency(), 16)
    }

    func testDiscoverExcludesKnownPorts() async {
        let checker = LatencyTrackingHealthChecker(
            latency: .zero,
            responders: [
                7171: .success(projectName: "Main", runtimeInfo: nil, projectPath: nil),
                7559: .success(projectName: "Other", runtimeInfo: nil, projectPath: nil),
            ]
        )

        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [7171],
            configuration: LocalServerDiscoveryConfiguration(overallDeadline: 2.0),
            healthChecker: checker,
            listeningPortEnumerator: { _ in [7171, 7559] }
        )

        XCTAssertEqual(found.map(\.port), [7559])
    }

    func testDiscoverRetriesOnceOnTimeout() async {
        let checker = FlakyTimeoutHealthChecker(
            succeedOnPort: 7559,
            failAttemptsBeforeSuccess: 1
        )

        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            configuration: LocalServerDiscoveryConfiguration(overallDeadline: 2.0),
            healthChecker: checker,
            listeningPortEnumerator: { _ in [7559] }
        )

        XCTAssertEqual(found.map(\.port), [7559])
        XCTAssertEqual(checker.attempts(for: 7559), 2)
    }

    func testDiscoverIgnoresConnectionRefusedWithoutRetry() async {
        let checker = LatencyTrackingHealthChecker(
            latency: .zero,
            responders: [:]
        )

        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            configuration: LocalServerDiscoveryConfiguration(overallDeadline: 1.0),
            healthChecker: checker,
            listeningPortEnumerator: { _ in [7200] }
        )

        XCTAssertTrue(found.isEmpty)
        XCTAssertEqual(checker.attempts(for: 7200), 1)
    }

    func testDiscoverStreamsPartialResults() async {
        let checker = LatencyTrackingHealthChecker(
            latency: .milliseconds(30),
            responders: [
                7010: .success(projectName: "First", runtimeInfo: nil, projectPath: nil),
                7020: .success(projectName: "Second", runtimeInfo: nil, projectPath: nil),
            ]
        )

        var snapshots: [[Int]] = []
        _ = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            configuration: LocalServerDiscoveryConfiguration(
                maxConcurrency: 1,
                overallDeadline: 5.0
            ),
            healthChecker: checker,
            listeningPortEnumerator: { _ in nil },
            portsToProbe: [7010, 7020],
            onUpdate: { partial in
                snapshots.append(partial.map(\.port))
            }
        )

        XCTAssertFalse(snapshots.isEmpty)
        XCTAssertTrue(snapshots.contains { $0 == [7010] })
        XCTAssertEqual(snapshots.last, [7010, 7020])
    }

    func testDiscoverCancelsInFlightWorkAtOverallDeadline() async {
        let checker = LatencyTrackingHealthChecker(
            latency: .seconds(3),
            responders: [
                7010: .success(projectName: "Late", runtimeInfo: nil, projectPath: nil),
            ]
        )

        let start = ContinuousClock.now
        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            configuration: LocalServerDiscoveryConfiguration(
                maxConcurrency: 1,
                probeTimeout: 5.0,
                overallDeadline: 0.35
            ),
            healthChecker: checker,
            listeningPortEnumerator: { _ in nil },
            portsToProbe: Array(7000 ... 7020)
        )

        let elapsed = start.duration(to: .now)
        XCTAssertTrue(found.isEmpty)
        XCTAssertLessThan(elapsed, .seconds(1.5))
    }

    func testDiscoverUsesListeningPortsWhenEnumeratorSucceeds() async {
        let checker = LatencyTrackingHealthChecker(
            latency: .zero,
            responders: [
                7400: .success(projectName: "From lsof", runtimeInfo: nil, projectPath: nil),
            ]
        )

        let found = await LocalServerDiscovery.discover(
            knownLocalPorts: [],
            configuration: LocalServerDiscoveryConfiguration(overallDeadline: 2.0),
            healthChecker: checker,
            listeningPortEnumerator: { _ in [7400] }
        )

        XCTAssertEqual(found.map(\.port), [7400])
        XCTAssertEqual(checker.probedPorts(), [7400])
    }
}

// MARK: - Test doubles

private final class LatencyTrackingHealthChecker: HealthChecking, @unchecked Sendable {
    private let lock = NSLock()
    private var inFlight = 0
    private var peak = 0
    private var attemptCounts: [Int: Int] = [:]
    private var probedPortOrder: [Int] = []

    let latency: Duration
    let responders: [Int: HealthCheckOutcome]

    init(latency: Duration, responders: [Int: HealthCheckOutcome]) {
        self.latency = latency
        self.responders = responders
    }

    func checkHealth(origin: URL) async -> HealthCheckOutcome {
        let port = origin.port ?? -1
        lock.lock()
        inFlight += 1
        peak = max(peak, inFlight)
        attemptCounts[port, default: 0] += 1
        probedPortOrder.append(port)
        lock.unlock()

        if latency != .zero {
            try? await Task.sleep(for: latency)
            if Task.isCancelled { return .failure(.network("cancelled")) }
        }

        lock.lock()
        inFlight -= 1
        lock.unlock()

        if let outcome = responders[port] {
            return outcome
        }
        return .failure(.network("connection refused"))
    }

    func peakConcurrency() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return peak
    }

    func attempts(for port: Int) -> Int {
        lock.lock()
        defer { lock.unlock() }
        return attemptCounts[port, default: 0]
    }

    func probedPorts() -> [Int] {
        lock.lock()
        defer { lock.unlock() }
        return probedPortOrder
    }
}

private final class FlakyTimeoutHealthChecker: HealthChecking, @unchecked Sendable {
    private let lock = NSLock()
    private var attemptCounts: [Int: Int] = [:]

    let succeedOnPort: Int
    let failAttemptsBeforeSuccess: Int

    init(succeedOnPort: Int, failAttemptsBeforeSuccess: Int) {
        self.succeedOnPort = succeedOnPort
        self.failAttemptsBeforeSuccess = failAttemptsBeforeSuccess
    }

    func checkHealth(origin: URL) async -> HealthCheckOutcome {
        let port = origin.port ?? -1
        lock.lock()
        let attempt = attemptCounts[port, default: 0]
        attemptCounts[port] = attempt + 1
        lock.unlock()

        guard port == succeedOnPort else {
            return .failure(.network("refused"))
        }
        if attempt < failAttemptsBeforeSuccess {
            return .failure(.timeout)
        }
        return .success(projectName: "Retry win", runtimeInfo: nil, projectPath: nil)
    }

    func attempts(for port: Int) -> Int {
        lock.lock()
        defer { lock.unlock() }
        return attemptCounts[port, default: 0]
    }
}
