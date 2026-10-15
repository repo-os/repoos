import AppKit
import WebKit

/// Hosts a server `WKWebView` and wires AppKit's find bar (`NSTextFinder`) to it.
/// WebKit implements `NSTextFinderClient` on macOS; this container supplies
/// `NSTextFinderBarContainer` so match counts and next/previous controls appear.
@MainActor
final class HubServerWebContainerView: NSView, NSTextFinderBarContainer {
    let webView: WKWebView

    var onKeyboardFocusChanged: ((Bool) -> Void)?

    private let textFinder = NSTextFinder()
    private var findBarHeight: CGFloat = 0
    private var focusMonitor: Any?

    var findBarView: NSView? {
        didSet {
            if oldValue !== findBarView {
                oldValue?.removeFromSuperview()
            }
            if let findBarView, findBarView.superview !== self {
                // NSTextFinder hands the bar over but never installs it. Without
                // this the bar has no window, cannot take focus, and the tiled
                // gap shows the black loading underlay behind the web view (#0789).
                // Pin it to the system appearance like the page so it stays
                // readable in light and dark regardless of the Hub shell theme.
                findBarView.appearance = HubSystemAppearance.appearance
                addSubview(findBarView)
            }
            if let height = findBarView?.frame.height, height > 0 {
                findBarHeight = height
            }
            tileFindBarAndWebView()
            publishKeyboardFocusState()
        }
    }

    var isFindBarVisible = false {
        didSet {
            guard oldValue != isFindBarVisible else { return }
            tileFindBarAndWebView()
            if !isFindBarVisible {
                // Esc/close resigns the find field; hand typing back to the page
                // only when focus did not already move somewhere else (e.g. the
                // sidebar), so closing the bar never yanks focus away (#0789).
                DispatchQueue.main.async { [weak self] in
                    guard let self, let window = self.window else { return }
                    if window.firstResponder == nil || window.firstResponder === window {
                        window.makeFirstResponder(self.webView)
                    }
                }
            }
            publishKeyboardFocusState()
        }
    }

    init(webView: WKWebView) {
        self.webView = webView
        super.init(frame: .zero)
        autoresizingMask = [.width, .height]

        webView.translatesAutoresizingMaskIntoConstraints = true
        webView.autoresizingMask = [.width, .height]
        addSubview(webView)

        textFinder.client = webView
        textFinder.findBarContainer = self
        textFinder.isIncrementalSearchingEnabled = true
        textFinder.incrementalSearchingShouldDimContentView = false
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        if let focusMonitor {
            NSEvent.removeMonitor(focusMonitor)
        }
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if let focusMonitor {
            NSEvent.removeMonitor(focusMonitor)
            self.focusMonitor = nil
        }
        guard window != nil else { return }
        focusMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .keyDown]) {
            [weak self] event in
            self?.publishKeyboardFocusState()
            return event
        }
        publishKeyboardFocusState()
    }

    override func layout() {
        super.layout()
        tileFindBarAndWebView()
    }

    func contentView() -> NSView? {
        webView
    }

    /// Keeps the NSTextFinder bar on the system appearance alongside the page,
    /// so a Hub shell override never leaves it mismatched after a system
    /// theme change (#0789).
    func pinFindBarToSystemAppearance() {
        findBarView?.appearance = HubSystemAppearance.appearance
    }

    func findBarViewDidChangeHeight() {
        findBarHeight = findBarView?.frame.height ?? 0
        tileFindBarAndWebView()
    }

    func containsKeyboardFocus(in window: NSWindow?) -> Bool {
        guard let window, let responder = window.firstResponder as? NSView else { return false }
        if responder === webView || responder.isDescendant(of: webView) {
            return true
        }
        if let findBarView, responder === findBarView || responder.isDescendant(of: findBarView) {
            return true
        }
        // While editing the find field, AppKit swaps in the window's shared
        // field editor, which lives outside the bar — still treat it as web
        // focus so Find Next/Previous stay enabled while typing (#0789).
        if isFindBarVisible, responder is NSText {
            return true
        }
        return responder === self || responder.isDescendant(of: self)
    }

    func presentFindInterface() {
        textFinder.performAction(.showFindInterface)
        focusFindField()
        // The bar usually arrives synchronously, but retry on the next runloop
        // so the field still takes focus when it lands a beat later.
        DispatchQueue.main.async { [weak self] in self?.focusFindField() }
        publishKeyboardFocusState()
    }

    func findNext() {
        textFinder.performAction(.nextMatch)
    }

    func findPrevious() {
        textFinder.performAction(.previousMatch)
    }

    /// Backstop for Esc when the find field itself does not consume it: the
    /// field normally hides the bar via NSTextFinder, this covers focus states
    /// around it. Web-page Esc never reaches here (WebKit consumes it).
    override func cancelOperation(_ sender: Any?) {
        if isFindBarVisible {
            textFinder.performAction(.hideFindInterface)
        } else {
            super.cancelOperation(sender)
        }
    }

    private func focusFindField() {
        guard let window, let bar = findBarView, bar.superview != nil else { return }
        // The bar's search box is an NSSearchField (an NSTextField subclass).
        window.makeFirstResponder(findTextField(in: bar) ?? bar)
    }

    private func findTextField(in view: NSView) -> NSTextField? {
        if let field = view as? NSTextField {
            return field
        }
        for subview in view.subviews {
            if let found = findTextField(in: subview) {
                return found
            }
        }
        return nil
    }

    private func publishKeyboardFocusState() {
        onKeyboardFocusChanged?(containsKeyboardFocus(in: window))
    }

    private func tileFindBarAndWebView() {
        let barHeight = isFindBarVisible ? findBarHeight : 0
        if let findBarView, isFindBarVisible {
            var barFrame = findBarView.frame
            barFrame.origin = CGPoint(x: 0, y: bounds.height - barHeight)
            barFrame.size.width = bounds.width
            findBarView.frame = barFrame
        }

        webView.frame = CGRect(
            x: 0,
            y: 0,
            width: bounds.width,
            height: max(0, bounds.height - barHeight)
        )
    }
}
