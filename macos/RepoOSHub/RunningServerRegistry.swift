import Foundation
import Darwin

/// JSON written by `repoos serve` under `~/.repoos/servers/<port>.json` (#0845).
struct RunningServerRegistryEntry: Codable, Sendable, Equatable {
    static let currentSchema = 1

    let schema: Int
    let port: Int
    let host: String
    let pid: Int32
    let root: String
    let projectName: String
    let version: String
    let startedAt: String
    let kind: String
}

enum RunningServerRegistryListOutcome: Sendable, Equatable {
    /// Directory missing, unreadable (sandbox), or listing failed — treat like missing for discovery.
    case unavailable
    /// Directory exists but has no `*.json` files.
    case empty
    /// One or more registry JSON files (may include malformed contents).
    case hasFiles
}

protocol ProcessAliveChecking: Sendable {
    func isAlive(pid: Int32) -> Bool
}

struct LiveProcessChecker: ProcessAliveChecking {
    func isAlive(pid: Int32) -> Bool {
        guard pid > 0 else { return false }
        if pid == getpid() { return true }
        let result = kill(pid, 0)
        if result == 0 { return true }
        return errno == EPERM
    }
}

/// Reads the machine-wide running-server registry directory.
struct RunningServerRegistrySource: Sendable {
    var directoryURL: URL
    var fileManager: FileManager

    init(directoryURL: URL, fileManager: FileManager = .default) {
        self.directoryURL = directoryURL
        self.fileManager = fileManager
    }

    static var defaultDirectoryURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".repoos/servers", isDirectory: true)
    }

    static var live: RunningServerRegistrySource {
        RunningServerRegistrySource(directoryURL: defaultDirectoryURL)
    }

    func listOutcome() -> RunningServerRegistryListOutcome {
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: directoryURL.path, isDirectory: &isDirectory),
              isDirectory.boolValue
        else {
            return .unavailable
        }
        do {
            let names = try fileManager.contentsOfDirectory(atPath: directoryURL.path)
            let jsonNames = names.filter { $0.hasSuffix(".json") }
            return jsonNames.isEmpty ? .empty : .hasFiles
        } catch {
            return .unavailable
        }
    }

    func loadEntries() -> [RunningServerRegistryEntry] {
        guard listOutcome() == .hasFiles else { return [] }
        do {
            let names = try fileManager.contentsOfDirectory(atPath: directoryURL.path)
            let jsonNames = names.filter { $0.hasSuffix(".json") }.sorted()
            var entries: [RunningServerRegistryEntry] = []
            for name in jsonNames {
                let fileURL = directoryURL.appendingPathComponent(name)
                guard let data = fileManager.contents(atPath: fileURL.path) else { continue }
                guard let entry = Self.parseEntry(from: data) else { continue }
                entries.append(entry)
            }
            return entries.sorted { $0.port < $1.port }
        } catch {
            return []
        }
    }

    static func parseEntry(from data: Data) -> RunningServerRegistryEntry? {
        guard let entry = try? JSONDecoder().decode(RunningServerRegistryEntry.self, from: data) else {
            return nil
        }
        guard entry.schema == RunningServerRegistryEntry.currentSchema else { return nil }
        guard entry.kind == "server" else { return nil }
        guard entry.port > 0, entry.port <= 65_535 else { return nil }
        return entry
    }

    static func canonicalRegistryRoot(_ path: String) -> String {
        let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return trimmed }
        return URL(fileURLWithPath: trimmed).resolvingSymlinksInPath().path
    }

    static func healthProbeHost(for entry: RunningServerRegistryEntry) -> String {
        if entry.host == "0.0.0.0" { return "127.0.0.1" }
        return entry.host
    }
}

enum RunningServerRegistryValidator {
    static func validate(
        entry: RunningServerRegistryEntry,
        pidChecker: ProcessAliveChecking,
        checker: HealthChecking
    ) async -> DiscoveredLocalServer? {
        guard pidChecker.isAlive(pid: entry.pid) else { return nil }

        let host = RunningServerRegistrySource.healthProbeHost(for: entry)
        guard let url = URL(string: "http://\(host):\(entry.port)") else { return nil }

        for attempt in 0 ..< 2 {
            if Task.isCancelled { return nil }
            switch await checker.checkHealth(origin: url) {
            case .success(_, _, let projectPath):
                guard let projectPath else { return nil }
                let healthRoot = RunningServerRegistrySource.canonicalRegistryRoot(projectPath)
                let registryRoot = RunningServerRegistrySource.canonicalRegistryRoot(entry.root)
                guard healthRoot == registryRoot else { return nil }
                return DiscoveredLocalServer(port: entry.port, projectName: entry.projectName)
            case .failure(.timeout):
                if attempt == 0 { continue }
                return nil
            case .failure:
                return nil
            }
        }
        return nil
    }

    static func discoverValidated(
        knownLocalPorts: Set<Int>,
        source: RunningServerRegistrySource,
        pidChecker: ProcessAliveChecking,
        checker: HealthChecking,
        onUpdate: (@Sendable ([DiscoveredLocalServer]) -> Void)?
    ) async -> [DiscoveredLocalServer] {
        let entries = source.loadEntries().filter { !knownLocalPorts.contains($0.port) }
        guard !entries.isEmpty else { return [] }

        let collector = DiscoveryResultCollector()
        await withTaskGroup(of: Void.self) { group in
            for entry in entries {
                group.addTask {
                    if let server = await validate(entry: entry, pidChecker: pidChecker, checker: checker) {
                        await collector.append(server, onUpdate: onUpdate)
                    }
                }
            }
            await group.waitForAll()
        }
        return await collector.sortedResults()
    }
}
