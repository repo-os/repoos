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
        let process = Process()
        let candidates = [
            URL(fileURLWithPath: "/opt/homebrew/bin/repoos"),
            URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".bun/bin/repoos"),
            URL(fileURLWithPath: "/usr/local/bin/repoos"),
        ]
        if let executable = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0.path) }) {
            process.executableURL = executable
            process.arguments = arguments
        } else {
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = ["repoos"] + arguments
        }
        process.currentDirectoryURL = URL(fileURLWithPath: projectRoot, isDirectory: true)
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
