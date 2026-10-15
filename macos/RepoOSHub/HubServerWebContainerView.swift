import AppKit
import WebKit

/// Hosts a server `WKWebView` and a compact, Hub-owned find bar.
///
/// #0789 wired AppKit's `NSTextFinder` bar here, but that bar always spans the
/// full container width, carries a Replace control the Hub does not need, and
/// leaves the container responsible for `isFindBarVisible` — which the finder
/// itself never set, so the bar was never tiled into place and appeared
/// unstyled at the bottom-left. This container instead drives
/// `WKWebView.find(_:configuration:completionHandler:)` directly and floats its
/// own find-only bar over the top-right of the page (#0795).
@MainActor
final class HubServerWebContainerView: NSView {
    let webView: WKWebView

    var onKeyboardFocusChanged: ((Bool) -> Void)?

    /// Internal so tests can assert the bar's chrome (no Replace, a Done
    /// control) and its floating position.
    let findBar = HubFindBarView()
    private var focusMonitor: Any?

    /// Whether the find bar is currently on screen. Exposed for tests and the
    /// find-focus bookkeeping that keeps Cmd-F/Cmd-G enabled while typing.
    var isFindBarVisible: Bool { !findBar.isHidden }

    init(webView: WKWebView) {
        self.webView = webView
        super.init(frame: .zero)
        autoresizingMask = [.width, .height]

        webView.translatesAutoresizingMaskIntoConstraints = true
        webView.autoresizingMask = [.width, .height]
        webView.frame = bounds
        addSubview(webView)

        findBar.isHidden = true
        addSubview(findBar)
        findBar.onQueryChange = { [weak self] query in self?.search(query, backwards: false) }
        findBar.onNext = { [weak self] in self?.findNext() }
        findBar.onPrevious = { [weak self] in self?.findPrevious() }
        findBar.onClose = { [weak self] in self?.hideFindInterface() }
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
        focusMonitor = NSEvent.addLocalMonitorForEvents(matching: [
            .leftMouseDown, .rightMouseDown, .keyDown,
        ]) { [weak self] event in
            guard let self else { return event }
            // Escape closes the bar while its field (or the bar chrome) has
            // focus. The shared field editor would otherwise swallow it.
            if event.type == .keyDown, event.keyCode == 53, self.findBarOwnsFocus(in: event.window) {
                self.hideFindInterface()
                return nil
            }
            self.publishKeyboardFocusState()
            return event
        }
        publishKeyboardFocusState()
    }

    override func layout() {
        super.layout()
        // The bar floats over the page, so the web view always fills the
        // container — no tiled gap for the black loading underlay to show
        // through (#0789).
        webView.frame = bounds
        layoutFindBar()
    }

    /// Keeps the find bar on the system appearance alongside the page, so a Hub
    /// shell override never leaves it mismatched after a system theme change.
    func pinFindBarToSystemAppearance() {
        findBar.appearance = HubSystemAppearance.appearance
    }

    func containsKeyboardFocus(in window: NSWindow?) -> Bool {
        guard let window, let responder = window.firstResponder as? NSView else { return false }
        if responder === webView || responder.isDescendant(of: webView) {
            return true
        }
        if responder === findBar || responder.isDescendant(of: findBar) {
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

    /// Shows the find bar (focusing its field) or, if already shown, refocuses
    /// the field and re-runs the current query.
    func presentFindInterface() {
        findBar.isHidden = false
        needsLayout = true
        layoutSubtreeIfNeeded()
        findBar.focus()
        if !findBar.query.isEmpty {
            search(findBar.query, backwards: false)
        }
        publishKeyboardFocusState()
    }

    func findNext() {
        find(backwards: false)
    }

    func findPrevious() {
        find(backwards: true)
    }

    /// Backstop for Escape when the find field does not consume it (for example
    /// focus sits on the bar chrome). Web-page Escape never reaches here.
    override func cancelOperation(_ sender: Any?) {
        if isFindBarVisible {
            hideFindInterface()
        } else {
            super.cancelOperation(sender)
        }
    }

    func hideFindInterface() {
        guard isFindBarVisible else { return }
        findBar.isHidden = true
        clearFindHighlights()
        findBar.setStatus(.idle)
        // Hand typing back to the page only when focus did not already move
        // somewhere else (e.g. the sidebar), so closing never yanks focus (#0789).
        DispatchQueue.main.async { [weak self] in
            guard let self, let window = self.window else { return }
            if window.firstResponder == nil || window.firstResponder === window
                || self.findBarOwnsFocus(in: window)
            {
                window.makeFirstResponder(self.webView)
            }
        }
        needsLayout = true
        layoutSubtreeIfNeeded()
        publishKeyboardFocusState()
    }

    // MARK: - Find

    private func find(backwards: Bool) {
        guard isFindBarVisible else {
            presentFindInterface()
            return
        }
        search(findBar.query, backwards: backwards)
    }

    private func search(_ query: String, backwards: Bool) {
        guard isFindBarVisible else { return }
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            clearFindHighlights()
            findBar.setStatus(.idle)
            return
        }
        var configuration = WKFindConfiguration()
        configuration.backwards = backwards
        configuration.wraps = true
        webView.find(query, configuration: configuration) { [weak self] result in
            self?.findBar.setStatus(result.matchFound ? .matches : .noMatches)
        }
    }

    /// Clears the page's find highlight. WebKit leaves the active match as the
    /// DOM selection and exposes no "clear find" call, so dropping the selection
    /// removes the overlay (#0795).
    private func clearFindHighlights() {
        webView.evaluateJavaScript(
            "(function(){var s=window.getSelection();if(s){s.removeAllRanges();}})()"
        ) { _, _ in }
    }

    // MARK: - Focus and layout

    private func findBarOwnsFocus(in window: NSWindow?) -> Bool {
        guard let window, isFindBarVisible else { return false }
        if let view = window.firstResponder as? NSView,
            view === findBar || view.isDescendant(of: findBar)
        {
            return true
        }
        if let editor = window.firstResponder as? NSTextView,
            let control = editor.delegate as? NSControl,
            control === findBar.searchField
        {
            return true
        }
        return false
    }

    private func publishKeyboardFocusState() {
        onKeyboardFocusChanged?(containsKeyboardFocus(in: window))
    }

    private func layoutFindBar() {
        guard isFindBarVisible else { return }
        let margin: CGFloat = 12
        let width = min(findBar.preferredWidth, max(0, bounds.width - margin * 2))
        let height = findBar.preferredHeight
        findBar.frame = NSRect(
            x: bounds.width - width - margin,
            y: bounds.height - height - margin,
            width: width,
            height: height
        )
    }
}

/// The Hub's own find bar: a query field, previous/next, a match indicator and
/// a Done button. Find-only — no Replace control (#0795). Floats over the
/// top-right of the page rather than spanning the container like AppKit's
/// `NSTextFinder` bar.
@MainActor
final class HubFindBarView: NSVisualEffectView, NSSearchFieldDelegate {
    enum Status {
        case idle
        case matches
        case noMatches
    }

    let searchField = NSSearchField()

    var onQueryChange: ((String) -> Void)?
    var onNext: (() -> Void)?
    var onPrevious: (() -> Void)?
    var onClose: (() -> Void)?

    let preferredWidth: CGFloat = 340
    let preferredHeight: CGFloat = 34

    private let previousButton = NSButton()
    private let nextButton = NSButton()
    private let closeButton = NSButton()
    private let statusLabel = NSTextField(labelWithString: "")

    var query: String { searchField.stringValue }

    init() {
        super.init(frame: .zero)
        material = .popover
        blendingMode = .withinWindow
        state = .active
        wantsLayer = true
        // Round the material into a floating pill. `masksToBounds` clips the
        // vibrancy to the corner radius; a solid shadow is intentionally omitted
        // so it can clip cleanly.
        layer?.cornerRadius = 10
        layer?.masksToBounds = true
        buildContent()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func setStatus(_ status: Status) {
        switch status {
        case .idle, .matches:
            statusLabel.stringValue = ""
        case .noMatches:
            statusLabel.stringValue = "No matches"
        }
    }

    func focus() {
        guard let window else { return }
        window.makeFirstResponder(searchField)
        let length = (query as NSString).length
        searchField.currentEditor()?.selectedRange = NSRange(location: 0, length: length)
    }

    private func buildContent() {
        searchField.placeholderString = "Find"
        searchField.font = .systemFont(ofSize: 12)
        searchField.delegate = self
        searchField.translatesAutoresizingMaskIntoConstraints = false
        searchField.setContentHuggingPriority(.defaultLow, for: .horizontal)
        searchField.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        statusLabel.font = .systemFont(ofSize: 10)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.lineBreakMode = .byTruncatingTail
        statusLabel.translatesAutoresizingMaskIntoConstraints = false

        configure(previousButton, symbol: "chevron.up", tooltip: "Previous match", action: #selector(previousTapped))
        configure(nextButton, symbol: "chevron.down", tooltip: "Next match", action: #selector(nextTapped))
        configure(closeButton, symbol: "xmark", tooltip: "Done", action: #selector(closeTapped))
        closeButton.setAccessibilityLabel("Done")

        let stack = NSStackView(views: [
            searchField, previousButton, nextButton, statusLabel, closeButton,
        ])
        stack.orientation = .horizontal
        stack.alignment = .centerY
        stack.spacing = 6
        stack.edgeInsets = NSEdgeInsets(top: 5, left: 10, bottom: 5, right: 10)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            searchField.heightAnchor.constraint(equalToConstant: 22),
            searchField.widthAnchor.constraint(greaterThanOrEqualToConstant: 120),
            statusLabel.widthAnchor.constraint(equalToConstant: 60),
        ])
        // The status column is a fixed cue; keep it from stealing the field's
        // space when the container is narrow.
        statusLabel.setContentHuggingPriority(.required, for: .horizontal)
        statusLabel.setContentCompressionResistancePriority(.required, for: .horizontal)
    }

    private func configure(_ button: NSButton, symbol: String, tooltip: String, action: Selector) {
        button.isBordered = false
        button.imagePosition = .imageOnly
        button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: tooltip)
        button.contentTintColor = .secondaryLabelColor
        button.toolTip = tooltip
        button.target = self
        button.action = action
        button.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            button.widthAnchor.constraint(equalToConstant: 24),
            button.heightAnchor.constraint(equalToConstant: 24),
        ])
    }

    @objc private func previousTapped() {
        onPrevious?()
    }

    @objc private func nextTapped() {
        onNext?()
    }

    @objc private func closeTapped() {
        onClose?()
    }

    func controlTextDidChange(_ obj: Notification) {
        if searchField.stringValue.isEmpty {
            statusLabel.stringValue = ""
        }
        onQueryChange?(searchField.stringValue)
    }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if commandSelector == #selector(NSResponder.insertNewline(_:)) {
            onNext?()
            return true
        }
        if commandSelector == #selector(NSResponder.cancelOperation(_:)) {
            onClose?()
            return true
        }
        return false
    }
}
