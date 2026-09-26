import AppKit
import SwiftUI

/// Opens the Hub's single app-level settings window. Uses selector strings
/// so the same path works on the macOS 13 deployment target without
/// touching macOS 14-only APIs such as SettingsLink or openSettings.
enum HubSettingsOpener {
    static func open() {
        guard let app = NSApp else { return }
        if app.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil) { return }
        if app.sendAction(Selector(("showPreferencesWindow:")), to: nil, from: nil) { return }
        // Both selectors unhandled: the entry point would silently do
        // nothing. Log so a future macOS/SwiftUI change is diagnosable.
        NSLog("RepoOS Hub: could not open the settings window (showSettingsWindow:/showPreferencesWindow: unhandled)")
    }
}

struct HubAppVersionInfo {
    var shortVersion: String
    var build: String

    static func current(bundle: Bundle = .main) -> HubAppVersionInfo {
        let version = (bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let build = (bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return HubAppVersionInfo(
            shortVersion: version.flatMap { $0.isEmpty ? nil : $0 } ?? "Unknown",
            build: build.flatMap { $0.isEmpty ? nil : $0 } ?? "Unknown"
        )
    }

    var displayText: String { "Version \(shortVersion) (\(build))" }
}

/// The Hub's one app-level settings surface. Per-server settings stay in the
/// sidebar context menu's Notifications sheet; this window owns only app-wide
/// preferences: appearance, updates, global notifications, and about.
struct HubSettingsView: View {
    @EnvironmentObject private var appState: HubAppState
    @State private var updateResult: HubUpdateResult = .notChecked
    @State private var isChecking = false
    // @State (not a plain stored property): the checker — and its six-hour
    // cache — must survive SwiftUI rebuilding this view value on every
    // appearance change and keystroke elsewhere.
    @State private var updateChecker = HubUpdateChecker()
    private static let versionInfo = HubAppVersionInfo.current()

    var body: some View {
        Form {
            Section("Appearance") {
                Picker("Hub theme", selection: appearanceBinding) {
                    ForEach(HubAppAppearance.allCases, id: \.self) { appearance in
                        Text(appearance.displayName).tag(appearance)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityLabel("Hub appearance")
                Text("Applies to the Hub shell only. Each server\u{2019}s web UI keeps its own theme.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Updates") {
                Text(Self.versionInfo.displayText)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Installed Hub version \(Self.versionInfo.shortVersion), build \(Self.versionInfo.build)")
                HStack {
                    Button(isChecking ? "Checking…" : "Check for Updates") {
                        checkForUpdates()
                    }
                    .disabled(isChecking)
                    // The direct download is offered only when the latest
                    // release actually ships the DMG asset; otherwise the
                    // releases page is the honest destination.
                    if let downloadURL = updateResult.downloadURL {
                        Button("Download update") {
                            NSWorkspace.shared.open(downloadURL)
                        }
                    }
                    if case .available = updateResult {
                        Button("View releases") {
                            NSWorkspace.shared.open(HubUpdateCheck.releasesURL)
                        }
                    }
                }
                Text(updateResult.statusText)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                if case .couldNotCheck(let reason) = updateResult {
                    Text(reason)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if case .available = updateResult {
                    Text("The Hub never installs updates itself. Download the DMG and replace the app by hand; your servers and preferences are preserved.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Notifications") {
                Toggle("Native notifications", isOn: globalNotificationsBinding)
                Toggle("Dock badge total", isOn: dockBadgeBinding)
                Text("Per-server attention, search, and pairing stay in each server\u{2019}s Notifications sheet.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("About") {
                Text(Self.versionInfo.displayText)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                Text("RepoOS Hub for Mac — one desktop place for your RepoOS servers.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .padding()
        .frame(width: 480)
        .preferredColorScheme(appState.hubGlobalPreferences.appearance.colorScheme)
        .onAppear {
            // Show a fresh cached outcome with no network. No cache means no
            // fetch: the check stays strictly on demand via the button.
            Task { @MainActor in
                if case .notChecked = updateResult, let cached = await updateChecker.cachedResult() {
                    updateResult = cached
                }
            }
        }
    }

    private var appearanceBinding: Binding<HubAppAppearance> {
        Binding(
            get: { appState.hubGlobalPreferences.appearance },
            set: { appState.updateHubAppearance($0) }
        )
    }

    private var globalNotificationsBinding: Binding<Bool> {
        Binding(
            get: { appState.hubGlobalPreferences.notificationsEnabled },
            set: { appState.updateHubGlobalPreferences(notificationsEnabled: $0, dockBadgeEnabled: nil) }
        )
    }

    private var dockBadgeBinding: Binding<Bool> {
        Binding(
            get: { appState.hubGlobalPreferences.dockBadgeEnabled },
            set: { appState.updateHubGlobalPreferences(notificationsEnabled: nil, dockBadgeEnabled: $0) }
        )
    }

    private func checkForUpdates() {
        guard !isChecking else { return }
        isChecking = true
        updateResult = .checking
        let current = Self.versionInfo.shortVersion == "Unknown" ? nil : Self.versionInfo.shortVersion
        Task { @MainActor in
            let result = await updateChecker.check(currentVersion: current, force: true)
            updateResult = result
            isChecking = false
        }
    }
}
