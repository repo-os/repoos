import Foundation

enum LocalRepoOSServiceAction: String, Sendable {
    case start
    case stop
    case restart

    var successMessage: String {
        switch self {
        case .start: return "Local RepoOS server started."
        case .stop: return "Local RepoOS server stopped."
        case .restart: return "Local RepoOS server restarted."
        }
    }
}

enum LocalRepoOSServiceController {
    static func perform(_ action: LocalRepoOSServiceAction, projectRoot: String) async throws {
        switch action {
        case .start:
            let result = try await run(["service", "start"], projectRoot: projectRoot)
            if result.status != 0, result.output.localizedCaseInsensitiveContains("No service found") {
                let installed = try await run(["service", "install"], projectRoot: projectRoot)
                guard installed.status == 0 else { throw ServiceError.commandFailed(installed.output) }
            } else if result.status != 0 {
                throw ServiceError.commandFailed(result.output)
            }
        case .stop, .restart:
            let result = try await run(["service", action.rawValue], projectRoot: projectRoot)
            guard result.status == 0 else { throw ServiceError.commandFailed(result.output) }
        }
    }

    private static func run(_ arguments: [String], projectRoot: String) async throws -> (status: Int32, output: String) {
        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: arguments,
            environment: ProcessInfo.processInfo.environment,
            fileSystem: LiveLocalRepoOSFileSystem()
        )
        let process = Process()
        process.executableURL = URL(fileURLWithPath: plan.executable)
        process.arguments = plan.arguments
        process.environment = plan.environment
        process.currentDirectoryURL = URL(fileURLWithPath: projectRoot, isDirectory: true)
        process.standardInput = FileHandle.nullDevice
        let output = Pipe()
        process.standardOutput = output
        process.standardError = output
        return try await withCheckedThrowingContinuation { continuation in
            process.terminationHandler = { completed in
                let text = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                continuation.resume(returning: (completed.terminationStatus, text))
            }
            do {
                try process.run()
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    enum ServiceError: LocalizedError {
        case commandFailed(String)

        var errorDescription: String? {
            switch self {
            case .commandFailed(let output):
                let trimmed = output.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? "RepoOS could not update the local background service." : trimmed
            }
        }
    }
}

/// The file-system questions the launch planner asks, so tests can describe a
/// Mac without touching the real disk.
protocol LocalRepoOSFileSystem {
    func isExecutable(atPath path: String) -> Bool
    /// The first line of a text file, or nil when it is unreadable or binary.
    func firstLine(atPath path: String) -> String?
    /// The file a symlink ultimately points at; the path itself otherwise.
    func resolvedPath(_ path: String) -> String
}

struct LiveLocalRepoOSFileSystem: LocalRepoOSFileSystem {
    func isExecutable(atPath path: String) -> Bool {
        FileManager.default.isExecutableFile(atPath: path)
    }

    func firstLine(atPath path: String) -> String? {
        guard let handle = FileHandle(forReadingAtPath: path) else { return nil }
        defer { try? handle.close() }
        let head = handle.readData(ofLength: 256)
        guard let text = String(data: head, encoding: .utf8) else { return nil }
        return text.split(whereSeparator: \.isNewline).first.map(String.init)
    }

    func resolvedPath(_ path: String) -> String {
        URL(fileURLWithPath: path).resolvingSymlinksInPath().path
    }
}

/// A fully resolved process launch for one `repoos` command.
struct LocalRepoOSLaunchPlan: Equatable {
    let executable: String
    let arguments: [String]
    let environment: [String: String]
}

/// Why the Hub could not build a launch. `LocalizedError` keeps the text plain
/// English, so the Hub never shows a raw `env:` message.
enum LocalRepoOSLaunchError: LocalizedError, Equatable {
    case repoosNotInstalled
    case runtimeMissing

    var errorDescription: String? {
        switch self {
        case .repoosNotInstalled:
            return "RepoOS isn't installed, so the Hub can't start a local server. "
                + "Install RepoOS, then try again. The Hub looks for the repoos command in "
                + "/opt/homebrew/bin, ~/.bun/bin, /usr/local/bin and ~/.local/bin."
        case .runtimeMissing:
            return "The Hub couldn't find Bun or Node.js, which the repoos command needs. "
                + "Install Bun (https://bun.sh), or Node.js 20.6 or newer, then try again. "
                + "Apps opened from Finder don't inherit your shell's PATH, so the Hub checks the usual install locations."
        }
    }
}

/// Resolves `repoos` and a JavaScript runtime explicitly.
///
/// A Finder or Dock launch inherits only `/usr/bin:/bin:/usr/sbin:/sbin`. The CLI
/// entry starts with `#!/usr/bin/env node`, so executing it directly fails with
/// `env: node: No such file or directory`. A JavaScript entry is therefore run as
/// `<bun|node> <entry>` with the runtime path chosen here. A shell launcher (the
/// curl-installed `~/.local/bin/repoos`) already probes its own runtimes and runs
/// directly.
enum LocalRepoOSLaunchPlanner {
    static func plan(
        arguments: [String],
        environment: [String: String],
        fileSystem: LocalRepoOSFileSystem
    ) throws -> LocalRepoOSLaunchPlan {
        let home = environment["HOME"].flatMap { $0.isEmpty ? nil : $0 } ?? NSHomeDirectory()
        let inheritedPath = environment["PATH"].map(pathEntries) ?? []
        let searchDirectories = knownBinDirectories(home: home) + inheritedPath

        let repoosCandidates = searchDirectories.map { $0 + "/repoos" }
        guard let repoos = repoosCandidates.first(where: fileSystem.isExecutable(atPath:)) else {
            throw LocalRepoOSLaunchError.repoosNotInstalled
        }

        let entry = fileSystem.resolvedPath(repoos)
        let shebang = fileSystem.firstLine(atPath: entry) ?? ""
        // The interpreter is the last word of the shebang, after any `/usr/bin/env`.
        let interpreter = shebang.split(separator: " ").last
            .map { String($0.split(separator: "/").last ?? "") } ?? ""
        let isShellLauncher = shebang.hasPrefix("#!") && ["sh", "bash", "zsh"].contains(interpreter)

        var executable = repoos
        var leading: [String] = []
        var runtimeDirectory: String?
        if !isShellLauncher {
            let runtime = try resolveRuntime(environment: environment, home: home, searchDirectories: searchDirectories, fileSystem: fileSystem)
            executable = runtime.path
            runtimeDirectory = (runtime.path as NSString).deletingLastPathComponent
            if runtime.isNode { leading.append("--no-warnings") }
            leading.append(entry)
        }

        let path = uniquePath(
            [runtimeDirectory].compactMap { $0 } + knownBinDirectories(home: home) + ["/usr/bin", "/bin", "/usr/sbin", "/sbin"] + inheritedPath
        )
        var childEnvironment = environment
        childEnvironment["PATH"] = path.joined(separator: ":")
        return LocalRepoOSLaunchPlan(executable: executable, arguments: leading + arguments, environment: childEnvironment)
    }

    private struct Runtime {
        let path: String
        let isNode: Bool
    }

    /// Bun first (the repo's default), Node only when pinned or Bun is missing.
    private static func resolveRuntime(
        environment: [String: String],
        home: String,
        searchDirectories: [String],
        fileSystem: LocalRepoOSFileSystem
    ) throws -> Runtime {
        let pinnedNode = environment["REPOOS_RUNTIME"]?.lowercased() == "node"
        if !pinnedNode {
            var bunCandidates: [String] = []
            if let explicit = environment["REPOOS_BUN_PATH"], !explicit.isEmpty {
                bunCandidates.append(explicit)
            }
            bunCandidates += searchDirectories.map { $0 + "/bun" }
            if let bun = bunCandidates.first(where: fileSystem.isExecutable(atPath:)) {
                return Runtime(path: bun, isNode: false)
            }
        }
        let nodeCandidates = [home + "/.local/share/mise/shims/node", "/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
            + searchDirectories.map { $0 + "/node" }
        guard let node = nodeCandidates.first(where: fileSystem.isExecutable(atPath:)) else {
            throw LocalRepoOSLaunchError.runtimeMissing
        }
        return Runtime(path: node, isNode: true)
    }

    /// Directories where the curl, Homebrew and Bun installers put `repoos` and the runtimes.
    private static func knownBinDirectories(home: String) -> [String] {
        [
            "/opt/homebrew/bin",
            home + "/.bun/bin",
            "/usr/local/bin",
            home + "/.local/bin",
        ]
    }

    private static func pathEntries(_ path: String) -> [String] {
        path.split(separator: ":").map(String.init).filter { !$0.isEmpty }
    }

    private static func uniquePath(_ entries: [String]) -> [String] {
        var seen = Set<String>()
        return entries.filter { seen.insert($0).inserted }
    }
}
