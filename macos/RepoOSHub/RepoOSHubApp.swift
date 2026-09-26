import SwiftUI
import UserNotifications
import AppKit

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
                .frame(minWidth: 880, maxWidth: .infinity, minHeight: 520, maxHeight: .infinity)
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
            window.titlebarAppearsTransparent = false
            window.isOpaque = true
            window.backgroundColor = hubAppearance.appKitWindowBackgroundColor
            window.toolbarStyle = .unified
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
/// delegate has finished launching. This view is attached only after the real
/// NSWindow exists, making the Hub preference authoritative for its native
/// title bar, toolbar, and sidebar.
private struct HubWindowAppearanceConfigurator: NSViewRepresentable {
    let appearance: HubAppAppearance

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        configureWindow(from: view)
        return view
    }

    func updateNSView(_ view: NSView, context: Context) {
        configureWindow(from: view)
    }

    private func configureWindow(from view: NSView) {
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            let appKitAppearance = appearance.appKitAppearance
            window.appearance = appKitAppearance
            window.titlebarAppearsTransparent = false
            window.isOpaque = true
            window.backgroundColor = appearance.appKitWindowBackgroundColor
            window.toolbarStyle = .unified
            window.contentView?.wantsLayer = true
            window.contentView?.layer?.backgroundColor = appearance.appKitWindowBackgroundColor.cgColor

            var frameView = window.contentView?.superview
            while let view = frameView {
                view.appearance = appKitAppearance
                view.wantsLayer = true
                view.layer?.backgroundColor = appearance.appKitWindowBackgroundColor.cgColor
                frameView = view.superview
            }
            applyNativeSurfaceBackgrounds(
                in: window.contentView,
                color: appearance.appKitWindowBackgroundColor,
                appearance: appKitAppearance
            )
        }
    }
}

private func applyNativeSurfaceBackgrounds(
    in view: NSView?,
    color: NSColor,
    appearance: NSAppearance?
) {
    guard let view else { return }
    let typeName = String(describing: type(of: view))
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
