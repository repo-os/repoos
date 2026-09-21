import SwiftUI

struct WorkspaceDetailView: View {
    @EnvironmentObject private var appState: HubAppState

    var body: some View {
        Group {
            if appState.entries.isEmpty {
                RegistryEmptyState(onAdd: appState.presentAddServer)
            } else if let entry = appState.selectedEntry {
                SelectedServerWorkspace(entry: entry)
            } else {
                SelectServerPrompt()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
        .navigationTitle(appState.selectedEntry?.name ?? "Workspace")
    }
}

private struct RegistryEmptyState: View {
    let onAdd: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "tray")
                .font(.system(size: 52, weight: .light))
                .foregroundStyle(.tint)
                .accessibilityHidden(true)

            Text("Add your first RepoOS server")
                .font(.title2.weight(.semibold))

            Text("Servers stay on this Mac. The Hub checks /api/health when you add or edit an entry, then opens the web workspace here in a later release.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 440)

            Button("Add server…", action: onAdd)
                .keyboardShortcut("n", modifiers: [.command, .shift])
        }
        .padding(32)
        .accessibilityElement(children: .contain)
    }
}

private struct SelectServerPrompt: View {
    var body: some View {
        VStack(spacing: 12) {
            Text("Select a server")
                .font(.title3.weight(.semibold))
            Text("Choose a saved server in the sidebar to make it the active workspace.")
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}

private struct SelectedServerWorkspace: View {
    @EnvironmentObject private var appState: HubAppState
    let entry: ServerEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .top, spacing: 16) {
                ServerIconView(entry: entry)
                    .font(.system(size: 28))
                    .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 6) {
                    Text(entry.name)
                        .font(.title2.weight(.semibold))
                    Text(entry.originString)
                        .font(.body.monospaced())
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                    Label(entry.lastHealth.displayTitle, systemImage: healthSymbol)
                        .foregroundStyle(healthColor)
                }
                Spacer()
            }

            if let message = appState.lastConnectionMessage {
                ConnectionFailurePanel(
                    message: message,
                    onRetry: { Task { await appState.refreshHealth(for: entry.id) } },
                    onEdit: { appState.presentEditServer(entry) },
                    onRemove: { appState.deleteServer(entry) }
                )
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Web workspace")
                        .font(.headline)
                    Text("The RepoOS web UI for this server will load in this area once the isolated WebKit shell ships. Your saved entry and session settings remain on this device.")
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding()
                .background(RoundedRectangle(cornerRadius: 10).fill(Color(nsColor: .controlBackgroundColor)))
            }

            HStack(spacing: 12) {
                Button("Check connection") {
                    Task { await appState.refreshHealth(for: entry.id) }
                }
                Button("Edit server…") {
                    appState.presentEditServer(entry)
                }
                Button("Remove server", role: .destructive) {
                    appState.deleteServer(entry)
                }
            }
        }
        .padding(28)
    }

    private var healthSymbol: String {
        switch entry.lastHealth {
        case .healthy: return "checkmark.circle.fill"
        case .unreachable: return "wifi.exclamationmark"
        case .invalid: return "xmark.octagon.fill"
        case .unknown: return "questionmark.circle"
        }
    }

    private var healthColor: Color {
        switch entry.lastHealth {
        case .healthy: return .green
        case .unreachable: return .orange
        case .invalid: return .red
        case .unknown: return .secondary
        }
    }
}

struct ConnectionFailurePanel: View {
    let message: String
    let onRetry: () -> Void
    let onEdit: () -> Void
    let onRemove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Connection problem", systemImage: "bolt.horizontal.fill")
                .font(.headline)
            Text(message)
                .foregroundStyle(.secondary)
            HStack {
                Button("Retry", action: onRetry)
                Button("Edit server…", action: onEdit)
                Button("Remove server", role: .destructive, action: onRemove)
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.orange.opacity(0.35)))
        .accessibilityElement(children: .contain)
    }
}
