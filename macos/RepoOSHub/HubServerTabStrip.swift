import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// Geometry for the single native row shared with the real traffic lights.
enum HubServerTabStripMetrics {
    /// Tall enough for the standard window buttons and a one-line tab label.
    static let height: CGFloat = 40
    static let minTabWidth: CGFloat = 88
    static let maxTabWidth: CGFloat = 168
    /// Used until the live window-button frames are measured.
    static let fallbackTrafficLightInset: CGFloat = 78
}

/// Compact Chrome-style server tabs. This view is drawn in the transparent
/// titlebar band (`fullSizeContentView`); it does not add a titlebar accessory
/// or a second toolbar. The native close, minimize, and zoom buttons stay the
/// window's own controls.
struct HubServerTabStrip: View {
    @EnvironmentObject private var appState: HubAppState
    @State private var trafficLightInset = HubServerTabStripMetrics.fallbackTrafficLightInset
    var snapshotHoverEntryID: UUID? = nil
    var snapshotChevronHover = false

    var body: some View {
        HStack(spacing: 0) {
            Color.clear
                .frame(width: trafficLightInset)
                .allowsHitTesting(false)
                .accessibilityHidden(true)

            tabActionsMenu
                .padding(.leading, 12)
                .padding(.trailing, 10)

            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 0) {
                        ForEach(appState.visibleServerTabEntries) { entry in
                            HubServerTab(
                                entry: entry,
                                isSelected: entry.id == appState.selectedServerID,
                                contentColor: contentColor,
                                startsHovering: entry.id == snapshotHoverEntryID
                            )
                            .id(entry.id)
                        }
                    }
                    .padding(.horizontal, 2)
                }
                .onChange(of: appState.selectedServerID) { id in
                    guard let id else { return }
                    withAnimation(.easeOut(duration: 0.15)) {
                        proxy.scrollTo(id, anchor: .center)
                    }
                }
            }

            addServerMenu
            settingsButton

            Spacer(minLength: 8)
                .background {
                    HubWindowDragRegion()
                        .accessibilityHidden(true)
                }
        }
        .frame(height: HubServerTabStripMetrics.height)
        .background {
            stripColor
                .allowsHitTesting(false)
        }
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color.primary.opacity(0.08))
                .frame(height: 1)
                .allowsHitTesting(false)
        }
        .background {
            HubTrafficLightInsetReader { inset in
                if abs(inset - trafficLightInset) > 0.5 {
                    trafficLightInset = inset
                }
            }
        }
        .background {
            tabShortcutCatcher
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Server tabs")
    }

    private var tabActionsMenu: some View {
        TabActionsMenuButton(startsHovering: snapshotChevronHover) {
        Menu {
            Button("Back") { appState.workspaceGoBack() }
                .disabled(!appState.workspaceNavigation.canGoBack)
            Button("Forward") { appState.workspaceGoForward() }
                .disabled(!appState.workspaceNavigation.canGoForward)
            Button("Reload") { appState.workspaceReload() }
                .disabled(!appState.workspaceNavigation.canReload)
            Divider()
            Button("Use Sidebar") {
                appState.updateServerNavigationLayout(.sidebar)
            }
            Button("Settings…") {
                HubSettingsOpener.open(appState: appState)
            }
        } label: {
            Image(systemName: "chevron.down")
                .font(.system(size: 10, weight: .semibold))
                .frame(width: 26, height: 26)
                .contentShape(Rectangle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .foregroundStyle(.secondary)
        .help("Back, forward, reload, and layout")
        .accessibilityLabel("Tab actions")
        }
    }

    private var addServerMenu: some View {
        Menu {
            if appState.entries.isEmpty {
                Button("Add server…") { appState.presentAddServer() }
            } else {
                ForEach(appState.entries.sorted(by: { $0.sortOrder < $1.sortOrder })) { entry in
                    let shown = appState.visibleServerTabEntries.contains(where: { $0.id == entry.id })
                    Button {
                        appState.showServerTab(entry.id)
                    } label: {
                        if shown {
                            Label(entry.name, systemImage: "checkmark")
                        } else {
                            Text(entry.name)
                        }
                    }
                }
                Divider()
                Button("Add server…") { appState.presentAddServer() }
            }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 12, weight: .semibold))
                .frame(width: 26, height: 26)
                .contentShape(Rectangle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .foregroundStyle(.secondary)
        .help("Show a server tab or add a server")
        .accessibilityLabel("Add server tab")
    }

    private var settingsButton: some View {
        Button {
            HubSettingsOpener.open(appState: appState)
        } label: {
            Image(systemName: "gearshape")
                .font(.system(size: 12, weight: .medium))
                .frame(width: 26, height: 26)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .help("RepoOS Hub settings")
        .accessibilityLabel("RepoOS Hub settings")
    }

    /// ⌘1–⌘9 select the first nine visible tabs. Control-Tab lives on the Go menu.
    private var tabShortcutCatcher: some View {
        VStack {
            ForEach(0..<9, id: \.self) { index in
                Button("") {
                    appState.selectVisibleTab(shortcutIndex: index)
                }
                .keyboardShortcut(KeyEquivalent(Character("\(index + 1)")), modifiers: .command)
                .accessibilityHidden(true)
            }
        }
        .frame(width: 0, height: 0)
        .opacity(0)
        .allowsHitTesting(false)
    }

    private var stripColor: Color {
        switch appState.hubGlobalPreferences.appearance {
        case .dark:
            return Color(red: 0.08, green: 0.08, blue: 0.08)
        case .light, .system:
            return Color(red: 0.90, green: 0.90, blue: 0.91)
        }
    }

    private var contentColor: Color {
        switch appState.hubGlobalPreferences.appearance {
        case .dark:
            return Color(red: 0.12, green: 0.12, blue: 0.12)
        case .light, .system:
            return .white
        }
    }
}

private struct HubServerTab: View {
    @EnvironmentObject private var appState: HubAppState
    let entry: ServerEntry
    let isSelected: Bool
    let contentColor: Color
    var startsHovering = false

    @State private var isHovering = false
    @State private var isDropTargeted = false
    @State private var isShowingDetails = false
    @State private var hideDetailsWork: DispatchWorkItem?

    private var attentionSnapshot: ServerAttentionSnapshot? {
        appState.attentionSnapshot(for: entry.id)
    }

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(ServerSidebarStatus.color(for: entry.lastHealth))
                .frame(width: 6, height: 6)
                .accessibilityHidden(true)

            Text(entry.name)
                .font(.system(size: 12, weight: isSelected ? .semibold : .regular))
                .lineLimit(1)
                .truncationMode(.tail)

            if let badge = badgeText {
                Text(badge)
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 4)
                    .frame(minWidth: 14, minHeight: 14)
                    .background(Capsule().fill(Color.orange))
                    .accessibilityLabel("\(badge) notifications")
            }

            if isHovering || isSelected {
                Button {
                    appState.hideServerTab(entry.id)
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 8, weight: .bold))
                        .frame(width: 14, height: 14)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Hide \(entry.name)")
            }
        }
        .padding(.horizontal, 12)
        .frame(minWidth: HubServerTabStripMetrics.minTabWidth, maxWidth: HubServerTabStripMetrics.maxTabWidth)
        .frame(height: HubServerTabStripMetrics.height)
        .foregroundStyle(isSelected ? .primary : .secondary)
        .background {
            HubServerTabShape()
                .fill(isSelected ? contentColor : (isHovering ? Color.primary.opacity(0.075) : .clear))
                .padding(.top, 3)
        }
        .overlay(alignment: .bottom) {
            if isDropTargeted {
                Rectangle()
                    .fill(Color.accentColor)
                    .frame(height: 3)
                    .allowsHitTesting(false)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            appState.selectServer(entry.id)
        }
        .onHover { hovering in
            isHovering = hovering
            if hovering {
                hideDetailsWork?.cancel()
                isShowingDetails = true
            } else {
                scheduleDetailsDismissal()
            }
        }
        .onAppear {
            if startsHovering {
                isHovering = true
            }
        }
        .onDrag {
            hideDetailsWork?.cancel()
            isShowingDetails = false
            return NSItemProvider(object: entry.id.uuidString as NSString)
        }
        .onDrop(of: [UTType.plainText], isTargeted: $isDropTargeted) { providers in
            HubServerTabDropHandler.accept(
                providers: providers,
                target: entry.id,
                onMove: { source, target in appState.moveServerTab(source: source, to: target) },
                onCompletion: { isDropTargeted = false }
            )
        }
        .popover(
            isPresented: $isShowingDetails,
            attachmentAnchor: .rect(.bounds),
            arrowEdge: .top
        ) {
            ServerDetailsPopover(
                entry: entry,
                runtimeInfo: appState.runtimeInfo(for: entry.id),
                attention: attentionSnapshot
            )
            .onHover { hovering in
                if hovering {
                    hideDetailsWork?.cancel()
                } else {
                    scheduleDetailsDismissal()
                }
            }
        }
        .contextMenu {
            Button("Hide tab") { appState.hideServerTab(entry.id) }
            Button("Move left") { move(forward: false) }
                .disabled(!canMove(forward: false))
            Button("Move right") { move(forward: true) }
                .disabled(!canMove(forward: true))
            Divider()
            ServerActionsMenu(entry: entry)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(entry.name), \(entry.lastHealth.displayTitle)")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .onDisappear {
            hideDetailsWork?.cancel()
            hideDetailsWork = nil
            isShowingDetails = false
        }
    }

    private var badgeText: String? {
        guard let snapshot = appState.attentionSnapshot(for: entry.id),
              snapshot.freshness != .unavailable,
              let total = snapshot.counts?.attentionTotal,
              total > 0
        else { return nil }
        return total > 99 ? "99+" : "\(total)"
    }

    private var visibleIDs: [UUID] {
        appState.visibleServerTabEntries.map(\.id)
    }

    private func canMove(forward: Bool) -> Bool {
        guard let index = visibleIDs.firstIndex(of: entry.id) else { return false }
        return forward ? index < visibleIDs.count - 1 : index > 0
    }

    private func move(forward: Bool) {
        guard let index = visibleIDs.firstIndex(of: entry.id) else { return }
        let neighbor = forward ? index + 1 : index - 1
        guard visibleIDs.indices.contains(neighbor) else { return }
        appState.moveServerTab(source: entry.id, to: visibleIDs[neighbor])
    }

    private func scheduleDetailsDismissal() {
        hideDetailsWork?.cancel()
        let work = DispatchWorkItem { isShowingDetails = false }
        hideDetailsWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(180), execute: work)
    }
}

/// Menu labels in a native titlebar have no default hover fill. Keep the
/// chevron's hover treatment in the same quiet capsule language as the tabs.
private struct TabActionsMenuButton<Content: View>: View {
    let content: Content
    var startsHovering = false
    @State private var isHovering = false

    init(startsHovering: Bool = false, @ViewBuilder content: () -> Content) {
        self.content = content()
        self.startsHovering = startsHovering
    }

    var body: some View {
        content
            .frame(width: 38, height: HubServerTabStripMetrics.height)
            .background {
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(isHovering ? Color.primary.opacity(0.09) : .clear)
                    .padding(.vertical, 3)
            }
            .contentShape(Rectangle())
            .onHover { isHovering = $0 }
            .onAppear {
                if startsHovering { isHovering = true }
            }
    }
}

/// Chrome-inspired tabs flare gently into a softly rounded crown.
private struct HubServerTabShape: Shape {
    func path(in rect: CGRect) -> Path {
        let radius: CGFloat = 9
        let flare: CGFloat = 5
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addCurve(
            to: CGPoint(x: rect.minX + radius, y: rect.minY),
            control1: CGPoint(x: rect.minX, y: rect.minY + flare),
            control2: CGPoint(x: rect.minX + flare, y: rect.minY)
        )
        path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        path.addCurve(
            to: CGPoint(x: rect.maxX, y: rect.minY + flare),
            control1: CGPoint(x: rect.maxX - flare, y: rect.minY),
            control2: CGPoint(x: rect.maxX, y: rect.minY + flare)
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

/// Empty space in the tab row remains a reliable window drag handle after
/// background dragging is disabled to protect interactive tabs.
struct HubWindowDragRegion: NSViewRepresentable {
    func makeNSView(context: Context) -> HubWindowDragRegionView { HubWindowDragRegionView(frame: .zero) }
    func updateNSView(_ nsView: HubWindowDragRegionView, context: Context) {}
}

final class HubWindowDragRegionView: NSView {
    override var mouseDownCanMoveWindow: Bool { true }

    override func hitTest(_ point: NSPoint) -> NSView? {
        _ = point
        return self
    }
}

@MainActor
enum HubServerTabDropHandler {
    static func accept(
        providers: [NSItemProvider],
        target: UUID,
        onMove: @escaping (UUID, UUID) -> Void,
        onCompletion: @escaping () -> Void
    ) -> Bool {
        guard let provider = providers.first, provider.canLoadObject(ofClass: NSString.self) else {
            return false
        }
        _ = provider.loadObject(ofClass: NSString.self) { object, _ in
            DispatchQueue.main.async {
                defer { onCompletion() }
                guard let raw = object as? String, let source = UUID(uuidString: raw) else { return }
                onMove(source, target)
            }
        }
        return true
    }
}

/// Reports how far the real traffic lights extend, so tabs never cover them.
private struct HubTrafficLightInsetReader: NSViewRepresentable {
    var onChange: (CGFloat) -> Void

    func makeNSView(context: Context) -> TrafficLightInsetView {
        let view = TrafficLightInsetView()
        view.onChange = onChange
        return view
    }

    func updateNSView(_ nsView: TrafficLightInsetView, context: Context) {
        nsView.onChange = onChange
        nsView.publish()
    }
}

final class TrafficLightInsetView: NSView {
    var onChange: ((CGFloat) -> Void)?

    deinit {
        stopObservingWindow()
    }

    override func viewWillMove(toWindow newWindow: NSWindow?) {
        super.viewWillMove(toWindow: newWindow)
        stopObservingWindow()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard let window else { return }
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(publish),
            name: NSWindow.didResizeNotification,
            object: window
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(publish),
            name: NSWindow.didEnterFullScreenNotification,
            object: window
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(publish),
            name: NSWindow.didExitFullScreenNotification,
            object: window
        )
        publish()
    }

    private func stopObservingWindow() {
        NotificationCenter.default.removeObserver(self)
    }

    @objc func publish() {
        guard let window else { return }
        let buttons: [NSWindow.ButtonType] = [.closeButton, .miniaturizeButton, .zoomButton]
        let maxX = buttons
            .compactMap { window.standardWindowButton($0) }
            .filter { !$0.isHidden }
            .map(\.frame.maxX)
            .max() ?? 0
        let inset = max(maxX + 8, 12)
        onChange?(inset)
    }
}
