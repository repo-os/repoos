import SwiftUI
import UserNotifications
import AppKit

/// Window geometry shared by the scene declaration and its unit test.
///
/// A SwiftUI `WindowGroup` with only a minimum frame opens new windows near that
/// minimum, centred, which felt like a quarter-screen popover rather than a
/// browser (#0859 E4). Give a brand-new window a default size that fills most of
/// the visible screen; macOS frame restoration still wins once the user has
/// resized the window, because `.defaultSize` only applies to a window with no
/// saved frame.
enum HubWindowDefaults {
    static let minWidth: CGFloat = 880
    static let minHeight: CGFloat = 520
    /// Fraction of `NSScreen.visibleFrame` a new window occupies. `visibleFrame`
    /// already excludes the menu bar and Dock, so 90% leaves a browser-like
    /// inset without ever covering them.
    static let visibleFrameFill: CGFloat = 0.9

    /// The default content size for a new window, clamped to the minimum size
    /// on a screen too small to fit the fill fraction (or when no screen is
    /// available, as in a unit test).
    static func defaultWindowSize(for visibleFrame: CGRect?) -> CGSize {
        guard let visibleFrame, visibleFrame.width > 0, visibleFrame.height > 0 else {
            return CGSize(width: minWidth, height: minHeight)
        }
        return CGSize(
            width: max(minWidth, visibleFrame.width * visibleFrameFill),
            height: max(minHeight, visibleFrame.height * visibleFrameFill)
        )
    }
}

@main
struct RepoOSHubApp: App {
    @NSApplicationDelegateAdaptor(HubAppDelegate.self) private var appDelegate
    @StateObject private var appState = HubAppState()
    @State private var notificationDelegate = HubNotificationDelegate()
    @State private var memoryPressureMonitor: HubMemoryPressureMonitor?

    var body: some Scene {
        WindowGroup("RepoOS") {
            ContentView()
                .environmentObject(appState)
                .frame(minWidth: HubWindowDefaults.minWidth, maxWidth: .infinity, minHeight: HubWindowDefaults.minHeight, maxHeight: .infinity)
                .preferredColorScheme(appState.hubGlobalPreferences.appearance.colorScheme)
                .background(HubWindowAppearanceConfigurator(appearance: appState.hubGlobalPreferences.appearance))
                .onAppear {
                    UNUserNotificationCenter.current().delegate = notificationDelegate
                    notificationDelegate.requestAuthorizationIfNeeded()
                    notificationDelegate.onOpenNavigation = { serverID, path in
                        appState.handleHubNotificationOpen(serverID: serverID, path: path)
                    }
                    if memoryPressureMonitor == nil {
                        memoryPressureMonitor = HubMemoryPressureMonitor { level in
                            appState.applyWorkspaceResidencyMemoryPressure(level)
                        }
                    }
                    appDelegate.setAppearanceOverride(appState.hubGlobalPreferences.appearance)
                }
                .onChange(of: appState.hubGlobalPreferences.appearance) { newValue in
                    appDelegate.setAppearanceOverride(newValue)
                }
        }
        // Structural hidden-title window style (#0878): SwiftUI can reset the
        // AppKit `titleVisibility` override while it finalises the scene, which
        // let the WindowGroup title draw over the web content again. The style
        // hides only the title text/bar chrome; the native traffic lights, drag
        // area, and `NSWindow.title` stay intact.
        .windowStyle(.hiddenTitleBar)
        .defaultSize(HubWindowDefaults.defaultWindowSize(for: NSScreen.main?.visibleFrame))
        .commands {
            CommandGroup(replacing: .appSettings) {
                Button("Settings…") {
                    HubSettingsOpener.open(appState: appState)
                }
                .keyboardShortcut(",", modifiers: .command)
            }
            CommandGroup(after: .newItem) {
                Button("Add Server…") {
                    appState.presentAddServer()
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            }
            CommandMenu("Edit") {
                Button("Find…") {
                    appState.workspacePresentFind()
                }
                .keyboardShortcut("f", modifiers: .command)
                .disabled(!appState.workspaceCanUseFind)

                Button("Find Next") {
                    appState.workspaceFindNext()
                }
                .keyboardShortcut("g", modifiers: .command)
                .disabled(!appState.workspaceCanUseFind)

                Button("Find Previous") {
                    appState.workspaceFindPrevious()
                }
                .keyboardShortcut("g", modifiers: [.command, .shift])
                .disabled(!appState.workspaceCanUseFind)
            }
            CommandMenu("Go") {
                Button("Quick Switcher…") {
                    appState.presentCommandPalette()
                }
                .keyboardShortcut("k", modifiers: .command)

                Divider()

                Button("Back") {
                    appState.workspaceGoBack()
                }
                .keyboardShortcut("[", modifiers: .command)
                .disabled(!appState.workspaceNavigation.canGoBack)

                Button("Forward") {
                    appState.workspaceGoForward()
                }
                .keyboardShortcut("]", modifiers: .command)
                .disabled(!appState.workspaceNavigation.canGoForward)

                Button("Reload") {
                    appState.workspaceReload()
                }
                .keyboardShortcut("r", modifiers: .command)

                Divider()

                Button("Next Server Tab") {
                    appState.selectAdjacentVisibleTab(forward: true)
                }
                .keyboardShortcut(.tab, modifiers: .control)
                .disabled(appState.hubGlobalPreferences.navigationLayout != .tabs)

                Button("Previous Server Tab") {
                    appState.selectAdjacentVisibleTab(forward: false)
                }
                .keyboardShortcut(.tab, modifiers: [.control, .shift])
                .disabled(appState.hubGlobalPreferences.navigationLayout != .tabs)
            }
        }
    }
}

final class HubAppDelegate: NSObject, NSApplicationDelegate {
    private let dockIconAppearance = DockIconAppearanceController()
    private var appKitAppearance: NSAppearance?
    private var hubAppearance: HubAppAppearance = .system

    func applicationDidFinishLaunching(_ notification: Notification) {
        dockIconAppearance.start()
    }

    func setAppearanceOverride(_ appearance: HubAppAppearance) {
        // preferredColorScheme updates SwiftUI content but does not update
        // AppKit-managed title bars or toolbars. Apply the same preference to
        // the application so the complete native shell follows Light/Dark.
        hubAppearance = appearance
        appKitAppearance = appearance.appKitAppearance
        applyAppKitAppearance()
        // A WindowGroup creates its AppKit window asynchronously. Reapply on
        // the next run loop so its title bar and toolbar do not keep the
        // system's previous appearance on first launch.
        DispatchQueue.main.async { [weak self] in
            self?.applyAppKitAppearance()
        }
        dockIconAppearance.appearanceOverride = appearance
    }

    private func applyAppKitAppearance() {
        // Existing SwiftUI-owned windows can retain the appearance they had
        // when they were created. Set it directly as well so title bars and
        // toolbars change immediately alongside the SwiftUI content.
        NSApp.appearance = appKitAppearance
        NSApp.windows.forEach { window in
            window.appearance = appKitAppearance
            window.isOpaque = true
            window.backgroundColor = hubAppearance.appKitWindowBackgroundColor
            window.contentView?.wantsLayer = true
            window.contentView?.layer?.backgroundColor = hubAppearance.appKitWindowBackgroundColor.cgColor

            // A SwiftUI WindowGroup's toolbar and rounded outer frame are
            // siblings/ancestors of contentView. They do not consistently
            // inherit a changed NSWindow appearance, so set every native
            // frame surface directly. Do not walk into contentView: its
            // WKWebView intentionally follows the system appearance.
            var frameView = window.contentView?.superview
            while let view = frameView {
                view.appearance = appKitAppearance
                view.wantsLayer = true
                view.layer?.backgroundColor = hubAppearance.appKitWindowBackgroundColor.cgColor
                frameView = view.superview
            }
            applyNativeSurfaceBackgrounds(
                in: window.contentView,
                color: hubAppearance.appKitWindowBackgroundColor,
                appearance: appKitAppearance
            )
        }
    }
}

/// SwiftUI's WindowGroup may assign its system appearance after the app
/// delegate has finished launching. This host view follows the real NSWindow
/// once AppKit attaches it, making the Hub preference authoritative for its
/// native title bar, toolbar, and sidebar.
private struct HubWindowAppearanceConfigurator: NSViewRepresentable {
    let appearance: HubAppAppearance

    func makeNSView(context: Context) -> HubWindowChromeView {
        HubWindowChromeView(appearance: appearance)
    }

    func updateNSView(_ view: HubWindowChromeView, context: Context) {
        view.hubAppearance = appearance
    }
}

/// Applies the workspace chrome once AppKit actually attaches this view to its
/// window.
///
/// `makeNSView` can run before SwiftUI has assigned the scene's NSWindow (and
/// a one-shot `DispatchQueue.main.async` can still lose that race), which left
/// the WindowGroup's "RepoOS" title visible over the web content (#0878).
/// `viewDidMoveToWindow` is the first point where the window is guaranteed to
/// exist, so the hidden-title chrome is applied there and re-applied whenever
/// SwiftUI updates the appearance.
final class HubWindowChromeView: NSView {
    var hubAppearance: HubAppAppearance {
        didSet { configureWindow() }
    }

    init(appearance: HubAppAppearance) {
        hubAppearance = appearance
        super.init(frame: .zero)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        configureWindow()
    }

    override func layout() {
        super.layout()
        // SwiftUI's NavigationSplitView installs its own toolbar (including an
        // automatic sidebar toggle) after the window first attaches, so hiding
        // it once in `configureWindow` misses it. Re-hide on every layout pass:
        // the 52pt native toolbar row otherwise sits over the tab strip and the
        // page, and its toggle duplicates the sidebar control (#0895).
        if let window {
            hideHubNativeToolbarRow(window)
        }
    }

    private func configureWindow() {
        guard let window else { return }
        let appKitAppearance = hubAppearance.appKitAppearance
        window.appearance = appKitAppearance
        configureHubWorkspaceWindowChrome(window)
        window.isOpaque = true
        window.backgroundColor = hubAppearance.appKitWindowBackgroundColor
        window.contentView?.wantsLayer = true
        window.contentView?.layer?.backgroundColor = hubAppearance.appKitWindowBackgroundColor.cgColor

        var frameView = window.contentView?.superview
        while let view = frameView {
            view.appearance = appKitAppearance
            view.wantsLayer = true
            view.layer?.backgroundColor = hubAppearance.appKitWindowBackgroundColor.cgColor
            frameView = view.superview
        }
        applyNativeSurfaceBackgrounds(
            in: window.contentView,
            color: hubAppearance.appKitWindowBackgroundColor,
            appearance: appKitAppearance
        )
    }
}

/// Gives the workspace window a full-height sidebar with no visible titlebar or
/// toolbar row (#0855) while keeping the real native traffic lights in their
/// standard upper-left position (#0857). Dragging, resizing, minimizing, and
/// fullscreen all stay native because this remains a standard titled NSWindow:
/// the title text is hidden, the titlebar is transparent, and the content view
/// extends underneath it. The sidebar toggle and navigation controls live in
/// the sidebar instead of a toolbar.
///
/// This is the AppKit half of the fix; the scene also declares the structural
/// `.windowStyle(.hiddenTitleBar)` because SwiftUI can reset `titleVisibility`
/// while it finalises the window, which let the WindowGroup's "RepoOS" title
/// reappear over the web content (#0878). The native traffic lights, the
/// titlebar drag area, and `NSWindow.title` itself (used by accessibility,
/// Mission Control, and the app switcher) all stay intact — only the drawing
/// of the title is suppressed.
func configureHubWorkspaceWindowChrome(_ window: NSWindow) {
    window.styleMask.insert(.fullSizeContentView)
    window.titleVisibility = .hidden
    window.titlebarAppearsTransparent = true
    window.titlebarSeparatorStyle = .none
    hideHubNativeToolbarRow(window)

    // SwiftUI may hide the standard buttons when a scene's toolbar visibility
    // changes. Keep the window's own close/minimize/fullscreen controls
    // explicitly visible so the transparent titlebar never loses them.
    let standardButtons: [NSWindow.ButtonType] = [.closeButton, .miniaturizeButton, .zoomButton]
    for buttonType in standardButtons {
        window.standardWindowButton(buttonType)?.isHidden = false
    }
}

/// SwiftUI's identifier for the sidebar toggle it adds to a
/// `NavigationSplitView` toolbar. The Hub supplies its own toggle in the
/// sidebar navigation row, so the system copy must never draw (#0895).
/// Hiding the toolbar row is the primary fix; removing the item as well means
/// a toolbar SwiftUI re-shows later still cannot duplicate the control. If a
/// future macOS renames the identifier the row stays hidden regardless.
enum HubNativeToolbar {
    static let swiftUISidebarToggleItemIdentifier =
        "com.apple.SwiftUI.navigationSplitView.toggleSidebar"
}

/// Hides the native toolbar row, which the Hub never shows, and removes the
/// system sidebar toggle it carries.
///
/// `NSWindow.toolbar` can be nil when the scene is first configured and be
/// installed by SwiftUI moments later, so callers must be able to re-run this
/// (the chrome view does so on every layout pass). Both operations are
/// idempotent and cheap when already applied.
func hideHubNativeToolbarRow(_ window: NSWindow) {
    guard let toolbar = window.toolbar else { return }
    if toolbar.isVisible {
        toolbar.isVisible = false
    }
    for index in toolbar.items.indices.reversed()
    where toolbar.items[index].itemIdentifier.rawValue
        == HubNativeToolbar.swiftUISidebarToggleItemIdentifier
    {
        toolbar.removeItem(at: index)
    }
}

private func applyNativeSurfaceBackgrounds(
    in view: NSView?,
    color: NSColor,
    appearance: NSAppearance?
) {
    guard let view else { return }
    let typeName = String(describing: type(of: view))
    // The workspace web container (page + find bar) manages its own surfaces:
    // the page is pinned to the system appearance and the find bar draws with
    // vibrancy. Painting flat Hub colors over it turns the bar into an
    // unreadable solid strip (#0789, #0795).
    if view is HubServerWebContainerView {
        return
    }
    guard !typeName.contains("WKWebView") else { return }

    // Keep the split-view/frame backing in sync with the selected Hub theme.
    if view is NSVisualEffectView || view is NSSplitView || typeName.contains("NSBlurryAlleywayView")
    {
        view.appearance = appearance
        view.wantsLayer = true
        view.layer?.backgroundColor = color.cgColor
    }

    // NavigationSplitView's leading frame is painted by its clip view rather
    // than by the SwiftUI List. Match that native surface without putting a
    // layer above the list rows themselves.
    if let clipView = view as? NSClipView {
        clipView.drawsBackground = true
        clipView.backgroundColor = color
    }

    view.subviews.forEach { subview in
        applyNativeSurfaceBackgrounds(in: subview, color: color, appearance: appearance)
    }
}

/// App icon variants are regular named assets rather than AppIcon appearances:
/// macOS app-icon catalogs do not assign appearance variants to the Dock icon.
final class DockIconAppearanceController {
    private var appearanceObserver: NSKeyValueObservation?
    var appearanceOverride: HubAppAppearance = .system {
        didSet { updateDockIcon() }
    }

    func start() {
        updateDockIcon()
        appearanceObserver = NSApp.observe(\.effectiveAppearance, options: .new) { [weak self] _, _ in
            self?.updateDockIcon()
        }
    }

    private func updateDockIcon() {
        NSApp.applicationIconImage = NSImage(named: Self.assetName(for: NSApp.effectiveAppearance, override: appearanceOverride))
    }

    static func assetName(for appearance: NSAppearance) -> NSImage.Name {
        assetName(for: appearance, override: .system)
    }

    static func assetName(for appearance: NSAppearance, override: HubAppAppearance) -> NSImage.Name {
        switch override {
        case .light:
            return "DockIconLight"
        case .dark:
            return "DockIconDark"
        case .system:
            return appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? "DockIconDark" : "DockIconLight"
        }
    }
}
