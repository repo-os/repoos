import Foundation

struct DiscoveredLocalServer: Identifiable, Sendable {
    let port: Int
    let projectName: String?
    var id: Int { port }
    var originString: String { "localhost:\(port)" }
    var displayName: String { projectName ?? "RepoOS" }
}

struct LocalServerDiscoveryConfiguration: Sendable {
    /// Typical RepoOS local serve port range.
    var portRange: ClosedRange<Int> = 7000 ... 7999
    var maxConcurrency: Int = 48
    /// Per health probe; connection refused fails immediately.
    var probeTimeout: TimeInterval = 1.25
    /// Stops dequeuing new ports after this, cancels in-flight probes, and returns partial results.
    var overallDeadline: TimeInterval = 2.0
}

/// Lists TCP listeners in `range` via `/usr/sbin/lsof` (`-iTCP:low-high -sTCP:LISTEN`).
/// Returns `nil` when lsof is missing or fails so discovery can fall back to a port scan.
enum LocalListeningPortEnumerator {
    static func listeningPorts(in range: ClosedRange<Int>) -> [Int]? {
        let lsofPath = "/usr/sbin/lsof"
        guard FileManager.default.isExecutableFile(atPath: lsofPath) else { return nil }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: lsofPath)
        process.arguments = [
            "-nP",
            "-iTCP:\(range.lowerBound)-\(range.upperBound)",
            "-sTCP:LISTEN",
            "-F",
            "n",
        ]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
        } catch {
            return nil
        }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        // lsof exits 1 when nothing matches; that is an empty listener set, not a tool failure.
        switch process.terminationStatus {
        case 0:
            return parsePorts(from: data, in: range)
        case 1 where data.isEmpty:
            return []
        default:
            return nil
        }
    }

    static func parsePorts(from data: Data, in range: ClosedRange<Int>) -> [Int] {
        guard let text = String(data: data, encoding: .utf8) else { return [] }
        var ports = Set<Int>()
        for line in text.split(whereSeparator: \.isNewline) {
            guard line.first == "n" else { continue }
            let name = String(line.dropFirst())
            if let port = portNumber(fromLsofName: name), range.contains(port) {
                ports.insert(port)
            }
        }
        return ports.sorted()
    }

    private static func portNumber(fromLsofName name: String) -> Int? {
        // Forms: *:7171, 127.0.0.1:7559, [::1]:7171
        if name.hasPrefix("[") {
            guard let close = name.firstIndex(of: "]") else { return nil }
            let after = name[name.index(after: close)...]
            guard after.first == ":" else { return nil }
            return Int(after.dropFirst())
        }
        guard let colon = name.lastIndex(of: ":") else { return nil }
        return Int(name[name.index(after: colon)...])
    }
}

enum LocalServerDiscovery {
    /// Probes localhost RepoOS servers for the Add-server sheet.
    ///
    /// **Port selection:** When `listeningPortEnumerator` returns a port list (including `[]` when
    /// `lsof` reports no listeners), only those ports are health-checked. When it returns `nil`
    /// (`lsof` missing or failed), every port in the range is scanned with bounded concurrency.
    /// An empty `lsof` result intentionally does not trigger a full scan — a false-empty `lsof`
    /// would be rare; use the manual URL field if discovery misses a server.
    static func discover(
        knownLocalPorts: Set<Int>,
        configuration: LocalServerDiscoveryConfiguration = LocalServerDiscoveryConfiguration(),
        healthChecker: HealthChecking? = nil,
        listeningPortEnumerator: (ClosedRange<Int>) -> [Int]? = LocalListeningPortEnumerator.listeningPorts,
        portsToProbe: [Int]? = nil,
        onUpdate: (@Sendable ([DiscoveredLocalServer]) -> Void)? = nil
    ) async -> [DiscoveredLocalServer] {
        let candidatePorts = portsToProbe ?? Self.portsToProbe(
            knownLocalPorts: knownLocalPorts,
            configuration: configuration,
            listeningPortEnumerator: listeningPortEnumerator
        )

        guard !candidatePorts.isEmpty else { return [] }

        let sharedSession = RepoOSHealthChecker.makeSharedDiscoverySession(
            timeout: configuration.probeTimeout
        )
        let checker = healthChecker ?? RepoOSHealthChecker(
            timeout: configuration.probeTimeout,
            urlSession: sharedSession
        )

        let deadline = Date().addingTimeInterval(configuration.overallDeadline)
        let collector = DiscoveryResultCollector()
        let portQueue = SharedPortIterator(ports: candidatePorts)
        let ownsNetworkSession = healthChecker == nil
        let workerCount = min(configuration.maxConcurrency, candidatePorts.count)

        await withTaskGroup(of: Void.self) { group in
            group.addTask {
                await Self.runProbeWorkers(
                    workerCount: workerCount,
                    portQueue: portQueue,
                    checker: checker,
                    collector: collector,
                    onUpdate: onUpdate
                )
            }
            group.addTask {
                let remaining = deadline.timeIntervalSinceNow
                if remaining > 0 {
                    try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
                }
                if ownsNetworkSession {
                    sharedSession.invalidateAndCancel()
                }
            }
            await group.next()
            group.cancelAll()
            await group.waitForAll()
        }

        if ownsNetworkSession {
            sharedSession.finishTasksAndInvalidate()
        }

        return await collector.sortedResults()
    }

    private static func runProbeWorkers(
        workerCount: Int,
        portQueue: SharedPortIterator,
        checker: HealthChecking,
        collector: DiscoveryResultCollector,
        onUpdate: (@Sendable ([DiscoveredLocalServer]) -> Void)?
    ) async {
        await withTaskGroup(of: Void.self) { workers in
            for _ in 0 ..< workerCount {
                workers.addTask {
                    while !Task.isCancelled {
                        guard let port = await portQueue.nextPort() else { return }
                        if let server = await Self.probe(port: port, checker: checker) {
                            await collector.append(server, onUpdate: onUpdate)
                        }
                    }
                }
            }
            await workers.waitForAll()
        }
    }

    private static func portsToProbe(
        knownLocalPorts: Set<Int>,
        configuration: LocalServerDiscoveryConfiguration,
        listeningPortEnumerator: (ClosedRange<Int>) -> [Int]?
    ) -> [Int] {
        if let listening = listeningPortEnumerator(configuration.portRange) {
            return listening.filter { !knownLocalPorts.contains($0) }
        }
        return configuration.portRange.filter { !knownLocalPorts.contains($0) }
    }

    private static func probe(port: Int, checker: HealthChecking) async -> DiscoveredLocalServer? {
        guard let url = URL(string: "http://localhost:\(port)") else { return nil }

        for attempt in 0 ..< 2 {
            if Task.isCancelled { return nil }
            switch await checker.checkHealth(origin: url) {
            case .success(let name, _, _):
                return DiscoveredLocalServer(port: port, projectName: name)
            case .failure(.timeout):
                if attempt == 0 { continue }
                return nil
            case .failure:
                return nil
            }
        }
        return nil
    }
}

// MARK: - Concurrency helpers

private actor SharedPortIterator {
    private var iterator: IndexingIterator<[Int]>

    init(ports: [Int]) {
        iterator = ports.makeIterator()
    }

    func nextPort() -> Int? {
        iterator.next()
    }
}

private actor DiscoveryResultCollector {
    private var results: [DiscoveredLocalServer] = []

    func append(_ server: DiscoveredLocalServer, onUpdate: (@Sendable ([DiscoveredLocalServer]) -> Void)?) {
        results.append(server)
        results.sort { $0.port < $1.port }
        onUpdate?(results)
    }

    func sortedResults() -> [DiscoveredLocalServer] {
        results.sorted { $0.port < $1.port }
    }
}
