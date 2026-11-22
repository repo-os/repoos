import XCTest
@testable import RepoOSHub

/// Describes a Mac's files to the planner, so each test controls which
/// runtimes and `repoos` installs exist without touching the disk.
private struct FakeFileSystem: LocalRepoOSFileSystem {
    var executables: Set<String> = []
    var shebangs: [String: String] = [:]
    var symlinks: [String: String] = [:]

    func isExecutable(atPath path: String) -> Bool { executables.contains(path) }
    func firstLine(atPath path: String) -> String? { shebangs[path] }
    func resolvedPath(_ path: String) -> String { symlinks[path] ?? path }
}

final class LocalRepoOSLaunchPlannerTests: XCTestCase {
    private let home = "/Users/tester"
    /// What a Finder or Dock launch inherits: no Homebrew, no ~/.bun/bin.
    private let finderPath = "/usr/bin:/bin:/usr/sbin:/sbin"
    private let homebrewRepoos = "/opt/homebrew/bin/repoos"
    private let bun = "/Users/tester/.bun/bin/bun"
    private let homebrewNode = "/opt/homebrew/bin/node"

    private func environment(path: String? = nil, extra: [String: String] = [:]) -> [String: String] {
        var env: [String: String] = ["HOME": home, "PATH": path ?? finderPath]
        env.merge(extra) { _, new in new }
        return env
    }

    func testFinderLaunchRunsNodeEntryThroughBunInsteadOfShebang() throws {
        let fs = FakeFileSystem(
            executables: [homebrewRepoos, bun],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "start"],
            environment: environment(),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, bun)
        XCTAssertEqual(plan.arguments, [homebrewRepoos, "service", "start"])
        let path = plan.environment["PATH"]?.split(separator: ":").map(String.init) ?? []
        XCTAssertEqual(path.first, "/Users/tester/.bun/bin", "the runtime's directory must be on the child PATH")
        XCTAssertTrue(path.contains("/opt/homebrew/bin"))
        XCTAssertEqual(Set(path).count, path.count, "PATH entries must not repeat")
        XCTAssertEqual(plan.environment["HOME"], home, "other inherited variables pass through")
    }

    func testSymlinkedEntryIsResolvedBeforeItRuns() throws {
        let target = "/Users/tester/.bun/install/global/node_modules/repoos/dist/cli/index.js"
        let fs = FakeFileSystem(
            executables: [homebrewRepoos, bun],
            shebangs: [target: "#!/usr/bin/env node"],
            symlinks: [homebrewRepoos: target]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "restart"],
            environment: environment(),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, bun)
        XCTAssertEqual(plan.arguments, [target, "service", "restart"])
    }

    func testNodeIsUsedWithExplicitPathWhenBunIsMissing() throws {
        let fs = FakeFileSystem(
            executables: [homebrewRepoos, homebrewNode],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "stop"],
            environment: environment(),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, homebrewNode)
        XCTAssertEqual(plan.arguments, ["--no-warnings", homebrewRepoos, "service", "stop"])
    }

    func testPinnedNodeSkipsBunEvenWhenBunIsInstalled() throws {
        let fs = FakeFileSystem(
            executables: [homebrewRepoos, bun, homebrewNode],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "start"],
            environment: environment(extra: ["REPOOS_RUNTIME": "node"]),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, homebrewNode)
    }

    func testExplicitBunPathWinsOverKnownLocations() throws {
        let custom = "/opt/custom/bun"
        let fs = FakeFileSystem(
            executables: [homebrewRepoos, bun, custom],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "start"],
            environment: environment(extra: ["REPOOS_BUN_PATH": custom]),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, custom)
    }

    func testMissingRuntimeThrowsPlainEnglishNotRawEnvError() throws {
        let fs = FakeFileSystem(
            executables: [homebrewRepoos],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"]
        )

        XCTAssertThrowsError(
            try LocalRepoOSLaunchPlanner.plan(arguments: ["service", "start"], environment: environment(), fileSystem: fs)
        ) { error in
            XCTAssertEqual(error as? LocalRepoOSLaunchError, .runtimeMissing)
            let message = (error as? LocalizedError)?.errorDescription ?? ""
            XCTAssertTrue(message.contains("Bun"))
            XCTAssertTrue(message.contains("Node.js"))
            XCTAssertFalse(message.contains("env:"))
            XCTAssertFalse(message.contains("No such file"))
        }
    }

    func testMissingRepoosThrowsNotInstalled() throws {
        XCTAssertThrowsError(
            try LocalRepoOSLaunchPlanner.plan(
                arguments: ["service", "start"],
                environment: environment(),
                fileSystem: FakeFileSystem(executables: [bun])
            )
        ) { error in
            XCTAssertEqual(error as? LocalRepoOSLaunchError, .repoosNotInstalled)
        }
    }

    func testRepoosFoundOnInheritedPathIsUsed() throws {
        let inherited = "/Users/tester/work/bin/repoos"
        let fs = FakeFileSystem(
            executables: [inherited, bun],
            shebangs: [inherited: "#!/usr/bin/env node"]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "start"],
            environment: environment(path: finderPath + ":/Users/tester/work/bin"),
            fileSystem: fs
        )

        XCTAssertEqual(plan.arguments, [inherited, "service", "start"])
    }

    func testShellLauncherRunsDirectlyBecauseItFindsItsOwnRuntime() throws {
        let launcher = "/Users/tester/.local/bin/repoos"
        let fs = FakeFileSystem(
            executables: [launcher],
            shebangs: [launcher: "#!/usr/bin/env bash"]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "start"],
            environment: environment(),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, launcher)
        XCTAssertEqual(plan.arguments, ["service", "start"])
    }
}
