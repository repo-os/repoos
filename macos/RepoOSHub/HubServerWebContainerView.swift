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
            tileFindBarAndWebView()
            publishKeyboardFocusState()
        }
    }

    var isFindBarVisible = false {
        didSet {
            guard oldValue != isFindBarVisible else { return }
            tileFindBarAndWebView()
            publishKeyboardFocusState()
        }
    }

    init(webView: WKWebView) {
        self.webView = webView
        super.init(frame: .zero)
        wantsLayer = true
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
        return responder === self || responder.isDescendant(of: self)
    }

    func presentFindInterface() {
        textFinder.performAction(.showFindInterface)
        publishKeyboardFocusState()
    }

    func findNext() {
        textFinder.performAction(.nextMatch)
    }

    func findPrevious() {
        textFinder.performAction(.previousMatch)
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
