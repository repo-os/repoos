import XCTest
@testable import RepoOSHub

/// Describes a Mac's files to the planner, so each test controls which
/// runtimes and `repoos` installs exist without touching the disk.
private struct FakeFileSystem: LocalRepoOSFileSystem {
    var executables: Set<String> = []
    var shebangs: [String: String] = [:]
    var symlinks: [String: String] = [:]
    /// Directory path → names of its entries, for version-manager install trees.
    var listings: [String: [String]] = [:]
    /// Node path → what `node --version` prints. Unlisted Node binaries report v22.0.0.
    var nodeVersions: [String: String] = [:]

    func isExecutable(atPath path: String) -> Bool { executables.contains(path) }
    func firstLine(atPath path: String) -> String? { shebangs[path] }
    func resolvedPath(_ path: String) -> String { symlinks[path] ?? path }
    func entryNames(atPath path: String) -> [String] { listings[path] ?? [] }
    func nodeVersion(atPath path: String) -> String? { nodeVersions[path] ?? "v22.0.0" }
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

    /// A Node installed by nvm, with `repoos` installed beside it by npm, as seen from Finder.
    func testNvmInstalledRepoosAndNodeAreFoundFromFinder() throws {
        let nvmBin = "/Users/tester/.nvm/versions/node/v20.11.0/bin"
        let nvmRepoos = nvmBin + "/repoos"
        let fs = FakeFileSystem(
            executables: [nvmRepoos, nvmBin + "/node"],
            shebangs: [nvmRepoos: "#!/usr/bin/env node"],
            listings: ["/Users/tester/.nvm/versions/node": ["v20.11.0"]]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "start"],
            environment: environment(),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, nvmBin + "/node")
        XCTAssertEqual(plan.arguments, ["--no-warnings", nvmRepoos, "service", "start"])
        let path = plan.environment["PATH"]?.split(separator: ":").map(String.init) ?? []
        XCTAssertEqual(path.first, nvmBin, "the child PATH starts with the runtime's directory")
    }

    func testNewestNvmVersionWinsByNumericOrder() throws {
        let v9 = "/Users/tester/.nvm/versions/node/v9.5.0/bin"
        let v20 = "/Users/tester/.nvm/versions/node/v20.11.0/bin"
        let fs = FakeFileSystem(
            executables: [v9 + "/node", v20 + "/node", v20 + "/repoos"],
            shebangs: [v20 + "/repoos": "#!/usr/bin/env node"],
            listings: ["/Users/tester/.nvm/versions/node": ["v9.5.0", "v20.11.0"]]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "start"],
            environment: environment(),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, v20 + "/node", "v20 is newer than v9 even though it sorts before it as text")
    }

    func testNvmDirEnvironmentVariableIsHonored() throws {
        let root = "/opt/nvm/versions/node/v22.1.0/bin"
        let fs = FakeFileSystem(
            executables: [root + "/repoos", root + "/node"],
            shebangs: [root + "/repoos": "#!/usr/bin/env node"],
            listings: ["/opt/nvm/versions/node": ["v22.1.0"]]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "start"],
            environment: environment(extra: ["NVM_DIR": "/opt/nvm"]),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, root + "/node")
    }

    func testMiseInstalledNodeAndBunAreFound() throws {
        let miseNode = "/Users/tester/.local/share/mise/installs/node/22.1.0/bin"
        let fs = FakeFileSystem(
            executables: ["/Users/tester/.local/bin/repoos", miseNode + "/node"],
            shebangs: ["/Users/tester/.local/bin/repoos": "#!/usr/bin/env node"],
            listings: ["/Users/tester/.local/share/mise/installs/node": ["22.1.0"]]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "start"],
            environment: environment(),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, miseNode + "/node")
    }

    func testMiseInstalledBunIsPreferredOverNode() throws {
        let miseBin = "/Users/tester/.local/share/mise/installs/bun/1.1.0/bin"
        let fs = FakeFileSystem(
            executables: [homebrewRepoos, miseBin + "/bun", homebrewNode],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"],
            listings: ["/Users/tester/.local/share/mise/installs/bun": ["1.1.0"]]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "start"],
            environment: environment(),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, miseBin + "/bun")
    }

    func testAsdfInstalledNodeIsFound() throws {
        let asdfBin = "/Users/tester/.asdf/installs/nodejs/20.0.0/bin"
        let fs = FakeFileSystem(
            executables: [homebrewRepoos, asdfBin + "/node"],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"],
            listings: ["/Users/tester/.asdf/installs/nodejs": ["20.0.0"]]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "start"],
            environment: environment(),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, asdfBin + "/node")
    }

    func testVersionManagerWithNoInstallsStillReportsRuntimeMissing() throws {
        let fs = FakeFileSystem(
            executables: [homebrewRepoos],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"],
            listings: ["/Users/tester/.nvm/versions/node": []]
        )

        XCTAssertThrowsError(
            try LocalRepoOSLaunchPlanner.plan(arguments: ["service", "start"], environment: environment(), fileSystem: fs)
        ) { error in
            XCTAssertEqual(error as? LocalRepoOSLaunchError, .runtimeMissing)
        }
    }

    // MARK: REPOOS_BUN_PATH is authoritative

    func testUnusableExplicitBunPathFallsBackToNodeNotOtherBun() throws {
        let fs = FakeFileSystem(
            executables: [homebrewRepoos, bun, homebrewNode],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "start"],
            environment: environment(extra: ["REPOOS_BUN_PATH": "/missing/bun"]),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, homebrewNode, "a bad REPOOS_BUN_PATH must not pick up ~/.bun/bin/bun")
        XCTAssertEqual(plan.arguments, ["--no-warnings", homebrewRepoos, "service", "start"])
    }

    func testUnusableExplicitBunPathWithNoNodeReportsRuntimeMissing() throws {
        let fs = FakeFileSystem(
            executables: [homebrewRepoos, bun],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"]
        )

        XCTAssertThrowsError(
            try LocalRepoOSLaunchPlanner.plan(
                arguments: ["service", "start"],
                environment: environment(extra: ["REPOOS_BUN_PATH": "/missing/bun"]),
                fileSystem: fs
            )
        ) { error in
            XCTAssertEqual(error as? LocalRepoOSLaunchError, .runtimeMissing)
        }
    }

    // MARK: Node minimum version

    func testNodeBelowMinimumIsRejectedWithSupportedRuntimeMessage() throws {
        let fs = FakeFileSystem(
            executables: [homebrewRepoos, homebrewNode],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"],
            nodeVersions: [homebrewNode: "v20.5.1"]
        )

        XCTAssertThrowsError(
            try LocalRepoOSLaunchPlanner.plan(arguments: ["service", "start"], environment: environment(), fileSystem: fs)
        ) { error in
            XCTAssertEqual(error as? LocalRepoOSLaunchError, .nodeTooOld(version: "v20.5.1"))
            let message = (error as? LocalizedError)?.errorDescription ?? ""
            XCTAssertTrue(message.contains("v20.5.1"))
            XCTAssertTrue(message.contains("Bun or Node.js 20.6 or newer"))
        }
    }

    func testNodeAtExactMinimumIsAccepted() throws {
        let fs = FakeFileSystem(
            executables: [homebrewRepoos, homebrewNode],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"],
            nodeVersions: [homebrewNode: "v20.6.0"]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "start"],
            environment: environment(),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, homebrewNode)
    }

    func testOldNodeIsSkippedForASupportedOneFurtherDown() throws {
        let nvmBin = "/Users/tester/.nvm/versions/node/v22.1.0/bin"
        let fs = FakeFileSystem(
            executables: [homebrewRepoos, homebrewNode, nvmBin + "/node"],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"],
            listings: ["/Users/tester/.nvm/versions/node": ["v22.1.0"]],
            nodeVersions: [homebrewNode: "v18.19.0"]
        )

        let plan = try LocalRepoOSLaunchPlanner.plan(
            arguments: ["service", "start"],
            environment: environment(),
            fileSystem: fs
        )

        XCTAssertEqual(plan.executable, nvmBin + "/node")
    }

    func testNodeWhoseVersionCannotBeReadIsNotUsable() throws {
        let fs = FakeFileSystem(
            executables: [homebrewRepoos, homebrewNode],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"],
            nodeVersions: [homebrewNode: "not-a-version"]
        )

        XCTAssertThrowsError(
            try LocalRepoOSLaunchPlanner.plan(arguments: ["service", "start"], environment: environment(), fileSystem: fs)
        ) { error in
            XCTAssertEqual(error as? LocalRepoOSLaunchError, .runtimeMissing)
        }
    }

    func testPinnedNodeIsAlsoHeldToTheMinimum() throws {
        let fs = FakeFileSystem(
            executables: [homebrewRepoos, homebrewNode],
            shebangs: [homebrewRepoos: "#!/usr/bin/env node"],
            nodeVersions: [homebrewNode: "v16.20.0"]
        )

        XCTAssertThrowsError(
            try LocalRepoOSLaunchPlanner.plan(
                arguments: ["service", "start"],
                environment: environment(extra: ["REPOOS_RUNTIME": "node"]),
                fileSystem: fs
            )
        ) { error in
            XCTAssertEqual(error as? LocalRepoOSLaunchError, .nodeTooOld(version: "v16.20.0"))
        }
    }

    func testVersionParserTable() {
        let cases: [(String, (Int, Int)?)] = [
            ("v20.6.0", (20, 6)),
            ("v20.5.9", (20, 5)),
            ("v22.12.0", (22, 12)),
            ("20.6.0", (20, 6)),
            ("v20", nil),
            ("", nil),
            ("vX.Y.Z", nil),
        ]
        for (text, expected) in cases {
            let parsed = LocalRepoOSLaunchPlanner.nodeMajorMinor(text)
            XCTAssertEqual(parsed?.0, expected?.0, text)
            XCTAssertEqual(parsed?.1, expected?.1, text)
        }
        XCTAssertTrue(LocalRepoOSLaunchPlanner.nodeMajorMinor("v20.6.0")! >= LocalRepoOSLaunchPlanner.minimumNodeVersion)
        XCTAssertFalse(LocalRepoOSLaunchPlanner.nodeMajorMinor("v20.5.9")! >= LocalRepoOSLaunchPlanner.minimumNodeVersion)
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
