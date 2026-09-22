import SwiftUI

struct ServerSidebarView: View {
    @EnvironmentObject private var appState: HubAppState

    private var serverSelection: Binding<UUID?> {
        Binding(
            get: { appState.selectedServerID },
            set: { appState.selectServer($0) }
        )
    }

    var body: some View {
        List(selection: serverSelection) {
            if !appState.pinnedTaskContextsForSidebar.isEmpty {
                Section("Pinned contexts") {
                    ForEach(appState.pinnedTaskContextsForSidebar) { context in
                        PinnedContextSidebarRow(context: context)
                    }
                }
            }

            if !appState.pinnedEntries.isEmpty {
                Section("Pinned") {
                    ForEach(appState.pinnedEntries) { entry in
                        ServerSidebarRow(entry: entry)
                            .tag(entry.id)
                    }
                    .onMove(perform: appState.movePinned)
                }
            }

            ForEach(appState.groupedEntries, id: \.title) { group in
                Section(group.title) {
                    ForEach(group.entries) { entry in
                        ServerSidebarRow(entry: entry)
                            .tag(entry.id)
                    }
                    .onMove { source, destination in
                        appState.moveGroup(named: group.title, from: source, to: destination)
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("RepoOS")
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Button {
                appState.presentAddServer()
            } label: {
                Label("Add server", systemImage: "plus")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.regular)
            .padding(12)
            .background(.bar)
            .help("Add a RepoOS server to the local registry")
        }
        .overlay {
            if appState.entries.isEmpty {
                SidebarEmptyHint()
            }
        }
    }
}

private struct SidebarEmptyHint: View {
    var body: some View {
        VStack(spacing: 8) {
            Text("No servers yet")
                .font(.headline)
            Text("Add a server to begin.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding()
        .accessibilityElement(children: .combine)
    }
}

struct ServerSidebarRow: View {
    @EnvironmentObject private var appState: HubAppState
    let entry: ServerEntry

    var body: some View {
        HStack(spacing: 10) {
            ServerIconView(entry: entry)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.name)
                    .lineLimit(1)
                Text(entry.originString)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            AttentionSummaryBadges(snapshot: appState.attentionSnapshot(for: entry.id))
        }
        .contextMenu {
            Button("Attention & notifications…") { appState.presentAttentionSettings(for: entry) }
            Button("Edit…") { appState.presentEditServer(entry) }
            Button("Pin task context…") { appState.presentPinTaskContext(for: entry) }
            Button(entry.isPinned ? "Unpin" : "Pin") {
                appState.setPinned(entry, pinned: !entry.isPinned)
            }
            Divider()
            Button("Remove", role: .destructive) {
                appState.deleteServer(entry)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(entry.name), \(entry.lastHealth.displayTitle)")
    }

}

private struct PinnedContextSidebarRow: View {
    @EnvironmentObject private var appState: HubAppState
    let context: PinnedTaskContext

    var body: some View {
        Button {
            appState.performCommandPaletteAction(.openPinned(context))
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "pin.fill")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.label)
                        .lineLimit(1)
                    Text("#\(context.taskIdentifier)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Open") {
                appState.performCommandPaletteAction(.openPinned(context))
            }
            Button("Unpin") {
                appState.unpinTaskContext(context)
            }
        }
        .accessibilityLabel("\(context.label), task \(context.taskIdentifier)")
    }
}

struct ServerIconView: View {
    let entry: ServerEntry

    var body: some View {
        let symbol = entry.iconSymbolName ?? "server.rack"
        Image(systemName: symbol)
            .font(.system(size: 16, weight: .medium))
            .foregroundStyle(statusColor)
            .frame(width: 24, height: 24)
            .help(statusHelp)
            .accessibilityLabel(statusHelp)
    }

    private var statusColor: Color {
        switch entry.lastHealth {
        case .unknown: return .secondary
        case .healthy: return .green
        case .unreachable: return .orange
        case .invalid: return .red
        }
    }

    private var statusHelp: String {
        let checkedAt: String
        if let lastHealthAt = entry.lastHealthAt {
            let formatter = RelativeDateTimeFormatter()
            formatter.unitsStyle = .short
            checkedAt = "\nLast checked: \(formatter.localizedString(for: lastHealthAt, relativeTo: Date()))"
        } else {
            checkedAt = ""
        }
        let repository = entry.repositoryName ?? "Not reported yet"
        return """
        Server: \(entry.name)
        Repository: \(repository)
        Address: \(entry.originString)
        Status: \(entry.lastHealth.displayTitle) (\(statusColorMeaning))\(checkedAt)

        Icon colors: green = healthy, orange = unreachable, red = invalid response, gray = not checked.
        """
    }

    private var statusColorMeaning: String {
        switch entry.lastHealth {
        case .unknown: return "gray"
        case .healthy: return "green"
        case .unreachable: return "orange"
        case .invalid: return "red"
        }
    }
}

struct AttentionSummaryBadges: View {
    let snapshot: ServerAttentionSnapshot?

    var body: some View {
        HStack(spacing: 4) {
            if let counts = snapshot?.counts, snapshot?.freshness != .unavailable {
                if counts.reviewReadyTasks > 0 {
                    AttentionBadge(count: counts.reviewReadyTasks, tint: .blue, label: "In review")
                }
                if counts.needsInputTasks > 0 {
                    AttentionBadge(count: counts.needsInputTasks, tint: .orange, label: "Needs input")
                }
                if counts.activeAgents > 0 {
                    AttentionBadge(count: counts.activeAgents, tint: .purple, label: "Active agents")
                }
            }
        }
        .accessibilityHidden(true)
    }
}

private struct AttentionBadge: View {
    let count: Int
    let tint: Color
    let label: String

    var body: some View {
        Text(count > 9 ? "9+" : "\(count)")
            .font(.caption2.weight(.semibold).monospacedDigit())
            .foregroundStyle(.white)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(Capsule().fill(tint))
            .help(label)
    }
}


extension Color {
    init?(hex: String) {
        var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.hasPrefix("#") { cleaned.removeFirst() }
        guard cleaned.count == 6 || cleaned.count == 8 else { return nil }
        var value: UInt64 = 0
        guard Scanner(string: cleaned).scanHexInt64(&value) else { return nil }
        let r, g, b, a: Double
        if cleaned.count == 6 {
            r = Double((value & 0xFF0000) >> 16) / 255
            g = Double((value & 0x00FF00) >> 8) / 255
            b = Double(value & 0x0000FF) / 255
            a = 1
        } else {
            r = Double((value & 0xFF000000) >> 24) / 255
            g = Double((value & 0x00FF0000) >> 16) / 255
            b = Double((value & 0x0000FF00) >> 8) / 255
            a = Double(value & 0x000000FF) / 255
        }
        self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}
