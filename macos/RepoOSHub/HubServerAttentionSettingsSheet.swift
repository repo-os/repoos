import SwiftUI

struct HubServerAttentionSettingsSheet: View {
    @EnvironmentObject private var appState: HubAppState
    @Environment(\.dismiss) private var dismiss

    let entry: ServerEntry
    @State private var aggregationEnabled: Bool
    @State private var notifyReviewReady: Bool
    @State private var notifyNeedsInput: Bool
    @State private var notifyActiveAgents: Bool
    @State private var crossServerTaskSearchEnabled: Bool
    @State private var capabilityToken: String = ""
    @State private var statusMessage: String?

    init(entry: ServerEntry) {
        self.entry = entry
        _aggregationEnabled = State(initialValue: entry.attentionAggregationEnabled)
        _notifyReviewReady = State(initialValue: entry.notifyReviewReady)
        _notifyNeedsInput = State(initialValue: entry.notifyNeedsInput)
        _notifyActiveAgents = State(initialValue: entry.notifyActiveAgents)
        _crossServerTaskSearchEnabled = State(initialValue: entry.crossServerTaskSearchEnabled)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Attention & notifications")
                .font(.title2.weight(.semibold))

            Text(accessExplanation)
            .font(.callout)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)

            Form {
                Section("Hub access") {
                    Toggle("Enable attention and notifications", isOn: $aggregationEnabled)
                    if isLocalServer {
                        Text("This local server is paired automatically. No token or sign-in handoff is needed.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Remote servers use a scoped pairing credential. Automatic remote pairing is not available yet.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        DisclosureGroup("Advanced remote pairing") {
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
                    }
                }

                Section("Command palette search") {
                    Toggle("Include this server in cross-server task search", isOn: $crossServerTaskSearchEnabled)
                    Text(
                        "When enabled, Cmd-K queries this server directly through the Hub task search API using your stored capability. Nothing is indexed on your Mac or sent to other servers."
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                Section("Aggregation") {
                    Text("Attention badges appear in the server list while Hub access is enabled.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
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
                        notifyActiveAgents: notifyActiveAgents,
                        crossServerTaskSearchEnabled: crossServerTaskSearchEnabled
                    )
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(24)
        .frame(width: 480)
    }

    private var isLocalServer: Bool {
        entry.originURL.map(HubAccessPolicy.permitsLoopbackWithoutCapability) == true
    }

    private var accessExplanation: String {
        isLocalServer
            ? "Enable local Hub attention for this server. RepoOS accepts these read-only requests only from this Mac's loopback connection."
            : "Enable attention for this server. Remote servers require an explicit scoped pairing credential; browser session cookies are never shared with the Hub."
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
