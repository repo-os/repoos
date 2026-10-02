import AppKit
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
        ZStack {
            sidebarBackground
                .ignoresSafeArea()
                .padding(.leading, -16)
            List(selection: serverSelection) {
                if !appState.pinnedTaskContextsForSidebar.isEmpty {
                    Section("Pinned tasks") {
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
            .scrollContentBackground(.hidden)
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
                .background(sidebarBackground)
                .help("Add a RepoOS server to the local registry")
            }
            .overlay {
                if appState.entries.isEmpty {
                    SidebarEmptyHint()
                }
            }
        }
    }

    private var sidebarBackground: Color {
        switch appState.hubGlobalPreferences.appearance {
        case .dark:
            return Color(red: 0.12, green: 0.12, blue: 0.12)
        case .light, .system:
            return .white
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

enum ServerSidebarRowLayout {
    static let columnSpacing: CGFloat = 10
    static let iconColumnWidth: CGFloat = 34
    static let minimumNameWidth: CGFloat = 40

    static func leadingChromeWidth() -> CGFloat {
        iconColumnWidth + columnSpacing
    }

    /// Minimum row width to keep the server name readable; badges sit on the subtitle row and are not reserved here.
    static func minimumRowWidth() -> CGFloat {
        leadingChromeWidth() + minimumNameWidth
    }

    static func badgesWidth(snapshot: ServerAttentionSnapshot?) -> CGFloat {
        guard let counts = snapshot?.counts, snapshot?.freshness != .unavailable else {
            return infoAffordanceWidth
        }
        var width: CGFloat = 0
        var badgeCount = 0
        let values = [counts.reviewReadyTasks, counts.needsInputTasks, counts.activeAgents]
        for value in values where value > 0 {
            if badgeCount > 0 { width += badgeSpacing }
            width += singleBadgeWidth(count: value)
            badgeCount += 1
        }
        return badgeCount > 0 ? width : infoAffordanceWidth
    }

    private static let badgeSpacing: CGFloat = 4
    private static let infoAffordanceWidth: CGFloat = 14

    private static func singleBadgeWidth(count: Int) -> CGFloat {
        let textWidth: CGFloat = count > 9 ? 14 : 9
        return 10 + textWidth
    }
}

struct ServerSidebarRow: View {
    @EnvironmentObject private var appState: HubAppState
    let entry: ServerEntry
    @State private var isShowingDetails = false

    private var attentionSnapshot: ServerAttentionSnapshot? {
        appState.attentionSnapshot(for: entry.id)
    }

    var body: some View {
        rowContent
            .overlay(alignment: .leading) {
                if let accentColor = ServerAccentColor.color(from: entry.accentColorHex) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(accentColor)
                        .frame(width: 4)
                        .frame(maxHeight: .infinity)
                        .offset(x: -(4 + ServerSidebarRowLayout.columnSpacing))
                        .accessibilityHidden(true)
                }
            }
            .contentShape(Rectangle())
            .contextMenu {
                ServerActionsMenu(entry: entry)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(entry.name), \(entry.lastHealth.displayTitle)")
            .accessibilityHint(ServerSidebarStatus.tooltip(for: entry))
            .popover(
                isPresented: $isShowingDetails,
                attachmentAnchor: .rect(.bounds),
                arrowEdge: .leading
            ) {
                ServerDetailsPopover(
                    entry: entry,
                    runtimeInfo: appState.runtimeInfo(for: entry.id),
                    attention: attentionSnapshot
                )
            }
    }

    private var rowContent: some View {
        HStack(spacing: ServerSidebarRowLayout.columnSpacing) {
            ServerIconActionButton(entry: entry)
            serverTextColumn
        }
    }

    private var serverTextColumn: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(entry.name)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            // The subtitle yields width to the fixed-size badges (see sizeThatFits below) and clips,
            // so a narrow sidebar truncates the URL instead of pushing badges out of the row.
            HStack(spacing: ServerSidebarRowLayout.columnSpacing / 2) {
                SidebarClippedSubtitleText(sidebarSubtitle)
                    .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
                    .clipped()
                badgesTrigger
                    .fixedSize()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var badgesTrigger: some View {
        InfoOrBadgesTrigger(
            snapshot: attentionSnapshot,
            isShowingDetails: $isShowingDetails
        )
    }

    private var sidebarSubtitle: String {
        guard let repositoryName = entry.repositoryName,
              repositoryName.caseInsensitiveCompare(entry.name) != .orderedSame
        else { return entry.originString.strippingURLScheme }
        return repositoryName
    }
}

private struct ServerActionsMenu: View {
    @EnvironmentObject private var appState: HubAppState
    let entry: ServerEntry

    var body: some View {
        Button { appState.presentAttentionSettings(for: entry) } label: {
            Label("Notifications…", systemImage: "bell")
        }
        Button { appState.presentPinTaskContext(for: entry) } label: {
            Label("Pin task…", systemImage: "pin")
        }
        Button {
            appState.setPinned(entry, pinned: !entry.isPinned)
        } label: {
            Label(entry.isPinned ? "Unpin server" : "Pin server", systemImage: entry.isPinned ? "pin.slash" : "pin.fill")
        }
        Button { appState.presentEditServer(entry) } label: {
            Label("Edit server…", systemImage: "pencil")
        }
        if canManageLocalService {
            Divider()
            if entry.lastHealth == .healthy {
                Button {
                    Task { await appState.performLocalServiceAction(.stop, for: entry) }
                } label: {
                    Label("Stop local server", systemImage: "stop.circle")
                }
                Button {
                    Task { await appState.performLocalServiceAction(.restart, for: entry) }
                } label: {
                    Label("Restart local server", systemImage: "arrow.clockwise")
                }
            } else {
                Button {
                    Task { await appState.performLocalServiceAction(.start, for: entry) }
                } label: {
                    Label("Start local server", systemImage: "play.circle")
                }
            }
        }
        Divider()
        Button(role: .destructive) {
            appState.deleteServer(entry)
        } label: {
            Label("Remove server", systemImage: "trash")
        }
    }

    private var canManageLocalService: Bool {
        entry.originURL.map(HubAccessPolicy.permitsLoopbackWithoutCapability) == true
            && entry.localProjectPath != nil
    }

}

private struct ServerIconActionButton: View {
    let entry: ServerEntry
    @State private var isHovering = false

    var body: some View {
        Menu {
            ServerActionsMenu(entry: entry)
        } label: {
            ServerIconView(entry: entry)
                .padding(5)
                .background {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(isHovering ? ServerSidebarStatus.color(for: entry.lastHealth).opacity(0.18) : .clear)
                }
                .overlay {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(isHovering ? ServerSidebarStatus.color(for: entry.lastHealth).opacity(0.38) : .clear, lineWidth: 1)
                }
                .scaleEffect(isHovering ? 1.05 : 1.0)
                .animation(.easeInOut(duration: 0.1), value: isHovering)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .tint(ServerSidebarStatus.color(for: entry.lastHealth))
        .onHover { isHovering = $0 }
        .help("Server actions")
        .accessibilityLabel("Actions for \(entry.name)")
        .accessibilityHint("Opens server settings and local service controls")
    }
}

/// Subtitle under the server name: clip at the trailing edge (no ellipsis) so badges can overlap when space is tight.
private struct SidebarClippedSubtitleText: NSViewRepresentable {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    func makeNSView(context: Context) -> NSTextField {
        let field = NSTextField(labelWithString: text)
        field.isBezeled = false
        field.isEditable = false
        field.isSelectable = false
        field.drawsBackground = false
        field.font = NSFont.preferredFont(forTextStyle: .caption1)
        field.textColor = .secondaryLabelColor
        field.lineBreakMode = .byClipping
        field.maximumNumberOfLines = 1
        field.cell?.truncatesLastVisibleLine = false
        field.cell?.lineBreakMode = .byClipping
        return field
    }

    func updateNSView(_ field: NSTextField, context: Context) {
        field.stringValue = text
    }

    /// Take whatever width the row offers (even less than the text needs); NSTextField's intrinsic
    /// width would otherwise act as a hard minimum and widen the row.
    func sizeThatFits(_ proposal: ProposedViewSize, nsView field: NSTextField, context: Context) -> CGSize? {
        let natural = field.intrinsicContentSize
        return CGSize(width: proposal.width ?? natural.width, height: natural.height)
    }
}

private struct InfoOrBadgesTrigger: View {
    let snapshot: ServerAttentionSnapshot?
    @Binding var isShowingDetails: Bool

    private var hasBadges: Bool {
        guard let counts = snapshot?.counts, snapshot?.freshness != .unavailable else { return false }
        return counts.reviewReadyTasks > 0 || counts.needsInputTasks > 0 || counts.activeAgents > 0
    }

    var body: some View {
        Group {
            if hasBadges {
                AttentionSummaryBadges(snapshot: snapshot)
            } else {
                Image(systemName: "info.circle")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .onHover { isShowingDetails = $0 }
        .help("Server details")
    }
}

private struct ServerDetailsPopover: View {
    let entry: ServerEntry
    let runtimeInfo: ServerRuntimeInfo?
    let attention: ServerAttentionSnapshot?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                ServerIconView(entry: entry)
                    .font(.system(size: 18, weight: .semibold))
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.name)
                        .font(.headline)
                    Text(entry.repositoryName ?? "Repository not reported")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                StatusPill(health: entry.lastHealth)
            }

            Divider()

            VStack(alignment: .leading, spacing: 9) {
                ServerDetailRow(icon: "network", title: "Address", value: entry.originString, monospaced: true)
                ServerDetailRow(
                    icon: "clock",
                    title: "Last checked",
                    value: relativeDate(entry.lastHealthAt) ?? "Not checked yet"
                )
                if let runtimeInfo {
                    if let version = runtimeInfo.version {
                        ServerDetailRow(icon: "tag", title: "Version", value: version)
                    }
                    if let startedAt = runtimeInfo.startedAt {
                        ServerDetailRow(icon: "timer", title: "Uptime", value: uptime(since: startedAt))
                    }
                    if let taskCount = runtimeInfo.taskCount {
                        ServerDetailRow(icon: "checklist", title: "Tasks", value: "\(taskCount) indexed")
                    }
                    if let branch = runtimeInfo.branch, !branch.isEmpty {
                        ServerDetailRow(icon: "arrow.triangle.branch", title: "Branch", value: branch, monospaced: true)
                    }
                    if let buildAt = runtimeInfo.buildAt {
                        ServerDetailRow(icon: "hammer", title: "Build", value: relativeDate(buildAt) ?? "Unknown")
                    }
                }
            }

            if let counts = attention?.counts, attention?.freshness != .unavailable {
                Divider()
                VStack(alignment: .leading, spacing: 9) {
                    Text("Attention")
                        .font(.subheadline.weight(.semibold))
                    ServerDetailRow(icon: "questionmark.circle", title: "Needs input", value: "\(counts.needsInputTasks) task\(counts.needsInputTasks == 1 ? "" : "s")")
                    ServerDetailRow(icon: "checkmark.seal", title: "In review", value: "\(counts.reviewReadyTasks) task\(counts.reviewReadyTasks == 1 ? "" : "s")")
                    ServerDetailRow(icon: "cpu", title: "Active agents", value: "\(counts.activeAgents)")
                    Text("Each colored badge is its category count. For example, an orange 4 means four tasks need input — not four active tasks.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(16)
        .frame(width: 350)
        .accessibilityElement(children: .contain)
    }

    private func relativeDate(_ date: Date?) -> String? {
        guard let date else { return nil }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    private func uptime(since date: Date) -> String {
        let interval = max(0, Date().timeIntervalSince(date))
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = [.day, .hour, .minute]
        formatter.unitsStyle = .abbreviated
        formatter.maximumUnitCount = 2
        return formatter.string(from: interval) ?? "Just started"
    }
}

private struct StatusPill: View {
    let health: HealthState

    var body: some View {
        Label(health.displayTitle, systemImage: ServerSidebarStatus.symbol(for: health))
            .font(.caption.weight(.semibold))
            .foregroundStyle(ServerSidebarStatus.color(for: health))
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(ServerSidebarStatus.color(for: health).opacity(0.12), in: Capsule())
    }
}

private struct ServerDetailRow: View {
    let icon: String
    let title: String
    let value: String
    var monospaced = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: icon)
                .frame(width: 15)
                .foregroundStyle(.secondary)
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 72, alignment: .leading)
            Text(value)
                .font(monospaced ? .caption.monospaced() : .caption)
                .lineLimit(1)
                .truncationMode(.middle)
        }
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
            .accessibilityLabel(ServerSidebarStatus.tooltip(for: entry))
    }

    private var statusColor: Color {
        ServerSidebarStatus.color(for: entry.lastHealth)
    }

}

enum ServerSidebarStatus {
    static func color(for health: HealthState) -> Color {
        switch health {
        case .unknown: return .secondary
        case .healthy: return .green
        case .unreachable: return .red
        case .invalid: return .yellow
        }
    }

    static func symbol(for health: HealthState) -> String {
        switch health {
        case .unknown: return "questionmark.circle"
        case .healthy: return "checkmark.circle.fill"
        case .unreachable: return "wifi.exclamationmark"
        case .invalid: return "exclamationmark.triangle.fill"
        }
    }

    static func tooltip(for entry: ServerEntry, now: Date = Date()) -> String {
        let checkedAt: String
        if let lastHealthAt = entry.lastHealthAt {
            let formatter = RelativeDateTimeFormatter()
            formatter.unitsStyle = .short
            checkedAt = "\nLast checked: \(formatter.localizedString(for: lastHealthAt, relativeTo: now))"
        } else {
            checkedAt = ""
        }
        let repository = entry.repositoryName ?? "Not reported yet"
        return """
        Server: \(entry.name)
        Repository: \(repository)
        Address: \(entry.originString)
        Status: \(entry.lastHealth.displayTitle) (\(colorName(for: entry.lastHealth)))\(checkedAt)

        Icon colors: green = connected, red = disconnected, yellow = reachable but not a valid RepoOS server, gray = not checked.
        """
    }

    private static func colorName(for health: HealthState) -> String {
        switch health {
        case .unknown: return "gray"
        case .healthy: return "green"
        case .unreachable: return "red"
        case .invalid: return "yellow"
        }
    }
}

enum ServerAccentColor {
    static func normalizedHex(_ value: String?) -> String? {
        guard let value else { return nil }
        let hex = value.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard hex.range(of: "^#[0-9A-F]{6}$", options: .regularExpression) != nil else { return nil }
        return hex
    }

    static func color(from value: String?) -> Color? {
        guard let hex = normalizedHex(value) else { return nil }
        let red = Double(Int(hex.dropFirst().prefix(2), radix: 16) ?? 0) / 255
        let green = Double(Int(hex.dropFirst(3).prefix(2), radix: 16) ?? 0) / 255
        let blue = Double(Int(hex.suffix(2), radix: 16) ?? 0) / 255
        return Color(red: red, green: green, blue: blue)
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


extension String {
    var strippingURLScheme: String {
        if hasPrefix("https://") { return String(dropFirst(8)) }
        if hasPrefix("http://") { return String(dropFirst(7)) }
        return self
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
