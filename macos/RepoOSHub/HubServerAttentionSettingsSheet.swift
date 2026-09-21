import SwiftUI

struct HubServerAttentionSettingsSheet: View {
    @EnvironmentObject private var appState: HubAppState
    @Environment(\.dismiss) private var dismiss

    let entry: ServerEntry
    @State private var aggregationEnabled: Bool
    @State private var notifyReviewReady: Bool
    @State private var notifyNeedsInput: Bool
    @State private var notifyActiveAgents: Bool
    @State private var capabilityToken: String = ""
    @State private var statusMessage: String?

    init(entry: ServerEntry) {
        self.entry = entry
        _aggregationEnabled = State(initialValue: entry.attentionAggregationEnabled)
        _notifyReviewReady = State(initialValue: entry.notifyReviewReady)
        _notifyNeedsInput = State(initialValue: entry.notifyNeedsInput)
        _notifyActiveAgents = State(initialValue: entry.notifyActiveAgents)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Attention & notifications")
                .font(.title2.weight(.semibold))

            Text(
                "Create a Hub read capability in RepoOS Settings on this server, then paste the one-time token here. Summaries never use your browser session cookie."
            )
            .font(.callout)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)

            Form {
                Section("Hub capability") {
                    SecureField("roh_… token", text: $capabilityToken)
                    Button("Save capability token") {
                        saveToken()
                    }
                    .disabled(capabilityToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    Button("Remove stored capability", role: .destructive) {
                        appState.removeHubCapability(for: entry)
                        capabilityToken = ""
                        statusMessage = "Capability removed from Keychain."
                    }
                }

                Section("Aggregation") {
                    Toggle("Show attention badges for this server", isOn: $aggregationEnabled)
                }

                Section("Notify me when counts increase") {
                    Toggle("Tasks ready for review", isOn: $notifyReviewReady)
                        .disabled(!aggregationEnabled)
                    Toggle("Tasks needing input", isOn: $notifyNeedsInput)
                        .disabled(!aggregationEnabled)
                    Toggle("Agents start running", isOn: $notifyActiveAgents)
                        .disabled(!aggregationEnabled)
                }
            }
            .formStyle(.grouped)

            if let statusMessage {
                Text(statusMessage)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            HStack {
                Button("Cancel") { dismiss() }
                Spacer()
                Button("Save preferences") {
                    appState.updateAttentionPreferences(
                        for: entry.id,
                        aggregationEnabled: aggregationEnabled,
                        notifyReviewReady: notifyReviewReady,
                        notifyNeedsInput: notifyNeedsInput,
                        notifyActiveAgents: notifyActiveAgents
                    )
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(24)
        .frame(width: 480)
    }

    private func saveToken() {
        let trimmed = capabilityToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("roh_") else {
            statusMessage = "Hub tokens start with roh_."
            return
        }
        do {
            try appState.saveHubCapability(for: entry, token: trimmed)
            capabilityToken = ""
            statusMessage = "Capability saved to Keychain."
        } catch {
            statusMessage = "Could not save the capability token."
        }
    }
}

struct HubGlobalAttentionSettingsView: View {
    @EnvironmentObject private var appState: HubAppState

    var body: some View {
        Form {
            Toggle("Native notifications", isOn: globalNotificationsBinding)
            Toggle("Dock badge total", isOn: dockBadgeBinding)
        }
        .formStyle(.grouped)
        .padding()
        .frame(width: 360)
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
}
