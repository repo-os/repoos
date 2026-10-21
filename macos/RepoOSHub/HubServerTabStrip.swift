import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// Geometry for the single native row shared with the real traffic lights.
enum HubServerTabStripMetrics {
    /// Tall enough for the standard window buttons and a one-line tab label.
    static let height: CGFloat = 46
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

    var body: some View {
        HStack(spacing: 0) {
            Color.clear
                .frame(width: trafficLightInset)
                .allowsHitTesting(false)
                .accessibilityHidden(true)

            tabActionsMenu

            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 0) {
                        ForEach(appState.visibleServerTabEntries) { entry in
                            HubServerTab(
                                entry: entry,
                                isSelected: entry.id == appState.selectedServerID,
                                contentColor: contentColor
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
                .allowsHitTesting(false)
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

    @State private var isHovering = false
    @State private var isDropTargeted = false

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
                .help("Hide \(entry.name)")
                .accessibilityLabel("Hide \(entry.name)")
            }
        }
        .padding(.leading, 10)
        .padding(.trailing, isHovering || isSelected ? 6 : 10)
        .frame(minWidth: HubServerTabStripMetrics.minTabWidth, maxWidth: HubServerTabStripMetrics.maxTabWidth)
        .frame(maxHeight: .infinity)
        .foregroundStyle(isSelected ? .primary : .secondary)
        .background(alignment: .bottom) {
            HubServerTabShape()
                .fill(isSelected ? contentColor : (isHovering ? Color.primary.opacity(0.06) : Color.clear))
                .padding(.top, 6)
        }
        .overlay(alignment: .bottom) {
            if isDropTargeted {
                Rectangle()
                    .fill(Color.accentColor)
                    .frame(width: 2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .allowsHitTesting(false)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            appState.selectServer(entry.id)
        }
        .onHover { isHovering = $0 }
        .onDrag {
            NSItemProvider(object: entry.id.uuidString as NSString)
        }
        .onDrop(of: [UTType.plainText], isTargeted: $isDropTargeted) { providers in
            guard let provider = providers.first else { return false }
            _ = provider.loadObject(ofClass: NSString.self) { object, _ in
                guard let raw = object as? String, let source = UUID(uuidString: raw) else { return }
                DispatchQueue.main.async {
                    appState.moveServerTab(source: source, to: entry.id)
                }
            }
            return true
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
        .help(ServerSidebarStatus.tooltip(for: entry))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(entry.name), \(entry.lastHealth.displayTitle)")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
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
}

/// Active tab silhouette: rounded on top, square on the bottom so it meets the page.
private struct HubServerTabShape: Shape {
    func path(in rect: CGRect) -> Path {
        let radius: CGFloat = 8
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + radius))
        path.addQuadCurve(
            to: CGPoint(x: rect.minX + radius, y: rect.minY),
            control: CGPoint(x: rect.minX, y: rect.minY)
        )
        path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.minY + radius),
            control: CGPoint(x: rect.maxX, y: rect.minY)
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.closeSubpath()
        return path
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

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        NotificationCenter.default.removeObserver(self)
        if let window {
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
        }
        publish()
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
