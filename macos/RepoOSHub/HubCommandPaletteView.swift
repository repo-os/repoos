import AppKit
import SwiftUI

struct HubCommandPaletteView: View {
    @EnvironmentObject private var appState: HubAppState
    @FocusState private var queryFocused: Bool
    @State private var query = ""
    @State private var highlightedIndex = 0
    @State private var keyMonitor: Any?

    private var items: [CommandPaletteItem] {
        CommandPaletteMatcher.buildItems(
            query: query,
            entries: appState.entries,
            recents: appState.serverRecents,
            pinnedContexts: appState.pinnedTaskContexts,
            remoteTasks: appState.crossServerTaskSearch.remoteResults
        )
    }

    private var showsRemoteSearchFooter: Bool {
        query.trimmingCharacters(in: .whitespacesAndNewlines).count >= HubCrossServerTaskSearchPolicy.minQueryLength
            && !appState.crossServerTaskSearch.serverLines.isEmpty
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.35)
                .ignoresSafeArea()
                .onTapGesture { appState.dismissCommandPalette() }

            VStack(spacing: 0) {
                TextField("Switch server, search tasks, or open a recent context", text: $query)
                    .textFieldStyle(.plain)
                    .font(.title3)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .focused($queryFocused)
                    .onSubmit { commitHighlighted() }
                    .accessibilityLabel("Quick switcher search")

                Divider()

                ScrollViewReader { proxy in
                    List {
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                            CommandPaletteRow(item: item, isHighlighted: index == highlightedIndex)
                                .id(item.id)
                                .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    highlightedIndex = index
                                    commit(item)
                                }
                        }
                    }
                    .listStyle(.plain)
                    .frame(maxHeight: 360)
                    .onChange(of: highlightedIndex) { newValue in
                        guard items.indices.contains(newValue) else { return }
                        withAnimation(.easeOut(duration: 0.12)) {
                            proxy.scrollTo(items[newValue].id, anchor: .center)
                        }
                    }
                    .onChange(of: query) { newValue in
                        highlightedIndex = 0
                        appState.crossServerTaskSearch.scheduleSearch(query: newValue)
                    }
                }

                if showsRemoteSearchFooter {
                    HubCrossServerSearchStatusFooter(
                        lines: appState.crossServerTaskSearch.serverLines,
                        isSearching: appState.crossServerTaskSearch.isSearching
                    )
                }

                if items.isEmpty {
                    Text("No matches")
                        .foregroundStyle(.secondary)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .frame(width: 560)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.primary.opacity(0.08)))
            .shadow(color: .black.opacity(0.25), radius: 24, y: 12)
            .padding(.top, 80)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .onAppear {
            query = ""
            highlightedIndex = 0
            queryFocused = true
            keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
                switch event.keyCode {
                case 126:
                    moveHighlightUp()
                    return nil
                case 125:
                    moveHighlightDown()
                    return nil
                default:
                    return event
                }
            }
        }
        .onDisappear {
            appState.crossServerTaskSearch.cancel()
            if let keyMonitor {
                NSEvent.removeMonitor(keyMonitor)
                self.keyMonitor = nil
            }
        }
        .onExitCommand { appState.dismissCommandPalette() }
    }

    private func moveHighlightUp() {
        highlightedIndex = max(0, highlightedIndex - 1)
    }

    private func moveHighlightDown() {
        highlightedIndex = min(max(0, items.count - 1), highlightedIndex + 1)
    }

    private func commitHighlighted() {
        guard items.indices.contains(highlightedIndex) else { return }
        commit(items[highlightedIndex])
    }

    private func commit(_ item: CommandPaletteItem) {
        appState.performCommandPaletteAction(item.action)
        appState.dismissCommandPalette()
    }
}

private struct CommandPaletteRow: View {
    let item: CommandPaletteItem
    let isHighlighted: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: iconName)
                .foregroundStyle(.secondary)
                .frame(width: 18)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.body.weight(.medium))
                if let subtitle = item.subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer()
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 6)
        .background(isHighlighted ? Color.accentColor.opacity(0.18) : Color.clear, in: RoundedRectangle(cornerRadius: 6))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(item.subtitle.map { "\(item.title), \($0)" } ?? item.title)
        .accessibilityAddTraits(isHighlighted ? .isSelected : [])
    }

    private var iconName: String {
        switch item.kind {
        case .server: return "server.rack"
        case .recent: return "clock"
        case .pinned: return "pin"
        case .remoteTask: return "tray.full"
        case .action: return "plus.circle"
        }
    }
}

private struct HubCrossServerSearchStatusFooter: View {
    let lines: [HubRemoteTaskSearchServerLine]
    let isSearching: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if isSearching {
                Text("Searching enabled servers…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(lines) { line in
                Text("\(line.serverName): \(line.status.displayText)")
                    .font(.caption2)
                    .foregroundStyle(line.status.isError ? Color.orange : Color.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.04))
    }
}

private extension HubRemoteTaskSearchServerStatus {
    var displayText: String {
        switch self {
        case .skipped: return "search disabled"
        case .searching: return "searching…"
        case .ok(let count, _): return count == 0 ? "no matches" : "\(count) match\(count == 1 ? "" : "es")"
        case .offline: return "offline"
        case .unauthorized: return "unauthorized — rotate Hub capability"
        case .missingCapability: return "no Hub capability"
        case .failed(let message): return message
        }
    }

    var isError: Bool {
        switch self {
        case .offline, .unauthorized, .missingCapability, .failed:
            return true
        default:
            return false
        }
    }
}
