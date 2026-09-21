import SwiftUI

struct WorkspaceDetailView: View {
    @EnvironmentObject private var appState: HubAppState

    var body: some View {
        Group {
            if appState.entries.isEmpty {
                RegistryEmptyState(onAdd: appState.presentAddServer)
            } else if let entry = appState.selectedEntry {
                ServerWebWorkspaceView(entry: entry)
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

            Text("Servers stay on this Mac. The Hub checks /api/health when you add or edit an entry, then opens the RepoOS web UI here in an isolated web view.")
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
