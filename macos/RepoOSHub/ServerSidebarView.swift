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
        .navigationTitle("RepoOS Hub")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    appState.presentAddServer()
                } label: {
                    Label("Add server", systemImage: "plus")
                }
                .help("Add a RepoOS server to the local registry")
            }
            ToolbarItem(placement: .automatic) {
                EditButton()
            }
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
            HealthIndicator(state: entry.lastHealth, checkedAt: entry.lastHealthAt)
        }
        .contextMenu {
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
            .foregroundStyle(entryAccentColor)
            .frame(width: 24, height: 24)
            .accessibilityHidden(true)
    }

    private var entryAccentColor: Color {
        if let hex = entry.accentColorHex, let color = Color(hex: hex) {
            return color
        }
        return .accentColor
    }
}

struct HealthIndicator: View {
    let state: HealthState
    let checkedAt: Date?

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 8, height: 8)
            .help(helpText)
            .accessibilityLabel(state.displayTitle)
    }

    private var color: Color {
        switch state {
        case .unknown: return Color.secondary.opacity(0.45)
        case .healthy: return .green
        case .unreachable: return .orange
        case .invalid: return .red
        }
    }

    private var helpText: String {
        if let checkedAt {
            let formatter = RelativeDateTimeFormatter()
            formatter.unitsStyle = .short
            return "\(state.displayTitle) · checked \(formatter.localizedString(for: checkedAt, relativeTo: Date()))"
        }
        return state.displayTitle
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
