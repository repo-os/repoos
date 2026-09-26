import Foundation

/// On-demand Hub update check. Check-and-link only: it never downloads,
/// installs, or replaces the app, and adds no third-party dependency.
/// Queries the GitHub latest-release endpoint the same way the web update
/// checker does, offers only stable releases, and caches the last result
/// for six hours (matching `UPDATE_CACHE_TTL_MS` in `src/core/agent-updates.ts`).
enum HubUpdateCheck {
    static let releasesURL = URL(string: "https://github.com/repo-os/repoos/releases")!
    static let latestReleaseAPIURL = URL(string: "https://api.github.com/repos/repo-os/repoos/releases/latest")!
    static let cacheTTL: TimeInterval = 6 * 60 * 60

    /// Numeric `1.10.0` > `1.9.0` comparison. Returns nil when either side
    /// is not an ordinary numeric version.
    static func compareVersions(_ lhs: String, _ rhs: String) -> Int? {
        guard let left = numericParts(lhs), let right = numericParts(rhs) else { return nil }
        for index in 0 ..< 3 {
            if left[index] != right[index] { return left[index] < right[index] ? -1 : 1 }
        }
        return 0
    }

    /// Only stable `X.Y.Z` tags are offered. Prereleases are never suggested.
    static func isStableTag(_ tag: String?, prerelease: Bool?) -> Bool {
        guard prerelease != true, let tag else { return false }
        return numericParts(tag) != nil
    }

    static func strippedTag(_ tag: String) -> String {
        tag.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "^v", with: "", options: .regularExpression)
    }

    private static func numericParts(_ version: String) -> [Int]? {
        let stripped = strippedTag(version)
        let parts = stripped.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else { return nil }
        var numbers: [Int] = []
        for part in parts {
            let digits = part.prefix(while: \.isNumber)
            guard !digits.isEmpty, digits.count == part.count, let value = Int(digits) else { return nil }
            numbers.append(value)
        }
        return numbers
    }

    /// Pure evaluation used by the UI and unit tests. A failed or
    /// unparseable check never reports an update.
    static func evaluate(tag: String?, prerelease: Bool?, currentVersion: String?, dmgDownloadURL: URL? = nil) -> HubUpdateResult {
        guard let current = currentVersion?.trimmingCharacters(in: .whitespacesAndNewlines),
              !current.isEmpty,
              let tag,
              isStableTag(tag, prerelease: prerelease)
        else {
            return .couldNotCheck(reason: "Could not determine the latest Hub version.")
        }
        let latest = strippedTag(tag)
        guard let comparison = compareVersions(latest, current) else {
            return .couldNotCheck(reason: "Could not compare Hub versions.")
        }
        if comparison > 0 {
            return .available(current: current, latest: latest, downloadURL: dmgDownloadURL)
        }
        return .upToDate(current: current, latest: latest)
    }
}

enum HubUpdateResult: Equatable, Sendable {
    case notChecked
    case checking
    case upToDate(current: String, latest: String)
    case available(current: String, latest: String, downloadURL: URL?)
    case couldNotCheck(reason: String)

    var statusText: String {
        switch self {
        case .notChecked:
            return "Check for a newer Hub."
        case .checking:
            return "Checking for updates…"
        case .upToDate(let current, _):
            return "You\u{2019}re up to date (version \(current))."
        case .available(_, let latest, _):
            return "Version \(latest) is available."
        case .couldNotCheck:
            return "Could not check for updates."
        }
    }

    /// The direct DMG download, when the latest release actually ships one.
    /// Nil means offer the releases page instead of a download button.
    var downloadURL: URL? {
        if case .available(_, _, let url) = self { return url }
        return nil
    }
}

struct HubLatestReleasePayload {
    var tag: String?
    var prerelease: Bool?
    /// Direct download for the `RepoOSHub.dmg` asset, if the release ships one.
    var dmgDownloadURL: URL?
}

enum HubUpdatePayloadParsing {
    /// Lenient decode: an HTML-instead-of-JSON response or any malformed
    /// body surfaces as a normal dismissible result, never a crash.
    static func parse(data: Data) -> HubLatestReleasePayload? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        let tag = json["tag_name"] as? String
        let prerelease = json["prerelease"] as? Bool
        return HubLatestReleasePayload(tag: tag, prerelease: prerelease, dmgDownloadURL: dmgAssetURL(json["assets"]))
    }

    private static func dmgAssetURL(_ assets: Any?) -> URL? {
        guard let assets = assets as? [[String: Any]] else { return nil }
        for asset in assets {
            guard (asset["name"] as? String) == "RepoOSHub.dmg",
                  let raw = asset["browser_download_url"] as? String,
                  let url = URL(string: raw),
                  url.scheme?.hasPrefix("http") == true
            else { continue }
            return url
        }
        return nil
    }
}

protocol HubUpdateFetching: Sendable {
    func fetchLatestRelease() async -> (data: Data?, statusCode: Int?)
}

struct HubURLSessionUpdateFetcher: HubUpdateFetching {
    func fetchLatestRelease() async -> (data: Data?, statusCode: Int?) {
        var request = URLRequest(
            url: HubUpdateCheck.latestReleaseAPIURL,
            cachePolicy: .reloadIgnoringLocalCacheData,
            timeoutInterval: 10
        )
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("RepoOS Hub update check", forHTTPHeaderField: "User-Agent")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            return (data, (response as? HTTPURLResponse)?.statusCode)
        } catch {
            return (nil, nil)
        }
    }
}

/// On-demand checker with a six-hour in-memory cache. There is no launch,
/// window-open, or timer fetch — the UI calls `check(force:)` explicitly.
/// An actor: all access is serialized without locks.
actor HubUpdateChecker {
    private var cached: (result: HubUpdateResult, at: Date)?
    private let fetcher: any HubUpdateFetching
    private let now: @Sendable () -> Date

    init(fetcher: any HubUpdateFetching = HubURLSessionUpdateFetcher(), now: @Sendable @escaping () -> Date = { Date() }) {
        self.fetcher = fetcher
        self.now = now
    }

    func check(currentVersion: String?, force: Bool = false) async -> HubUpdateResult {
        let currentNow = now()
        if !force, let existing = cached, currentNow.timeIntervalSince(existing.at) < HubUpdateCheck.cacheTTL {
            return existing.result
        }
        let result = await performCheck(currentVersion: currentVersion)
        cached = (result, currentNow)
        return result
    }

    /// The last fresh result without any network. Lets the settings window
    /// show a recent outcome on open while staying on-demand only.
    func cachedResult() -> HubUpdateResult? {
        guard let cached, now().timeIntervalSince(cached.at) < HubUpdateCheck.cacheTTL else { return nil }
        return cached.result
    }

    private func performCheck(currentVersion: String?) async -> HubUpdateResult {
        let (data, statusCode) = await fetcher.fetchLatestRelease()
        guard let statusCode, (200 ..< 300).contains(statusCode), let data,
              let payload = HubUpdatePayloadParsing.parse(data: data)
        else {
            if statusCode == 403 {
                return .couldNotCheck(reason: "GitHub rate-limited the update check. Try again later.")
            }
            return .couldNotCheck(reason: "Could not reach the releases service. Check your connection and try again.")
        }
        let evaluated = HubUpdateCheck.evaluate(
            tag: payload.tag,
            prerelease: payload.prerelease,
            currentVersion: currentVersion,
            dmgDownloadURL: payload.dmgDownloadURL
        )
        // A failed evaluation never reports an update.
        return evaluated
    }
}
