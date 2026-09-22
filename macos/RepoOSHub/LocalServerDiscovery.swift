import Foundation

struct DiscoveredLocalServer: Identifiable, Sendable {
    let port: Int
    let projectName: String?
    var id: Int { port }
    var originString: String { "localhost:\(port)" }
    var displayName: String { projectName ?? "RepoOS" }
}

enum LocalServerDiscovery {
    // Probe the typical RepoOS port space; closed ports fail instantly (ECONNREFUSED).
    private static let probePorts = Array(7000 ... 7999)

    static func discover(knownLocalPorts: Set<Int>) async -> [DiscoveredLocalServer] {
        let checker = RepoOSHealthChecker(timeout: 0.4)
        return await withTaskGroup(of: DiscoveredLocalServer?.self) { group in
            for port in probePorts where !knownLocalPorts.contains(port) {
                group.addTask {
                    guard let url = URL(string: "http://localhost:\(port)") else { return nil }
                    if case .success(let name, _, _) = await checker.checkHealth(origin: url) {
                        return DiscoveredLocalServer(port: port, projectName: name)
                    }
                    return nil
                }
            }
            var results: [DiscoveredLocalServer] = []
            for await result in group {
                if let r = result { results.append(r) }
            }
            return results.sorted { $0.port < $1.port }
        }
    }
}
