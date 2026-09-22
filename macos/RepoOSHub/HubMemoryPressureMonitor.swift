import Dispatch

/// Forwards macOS memory-pressure events so the Hub can shrink its WebView working set.
final class HubMemoryPressureMonitor {
    private var source: DispatchSourceMemoryPressure?

    init(onPressure: @escaping (HubWorkspaceWebViewResidency.MemoryPressureLevel) -> Void) {
        let source = DispatchSource.makeMemoryPressureSource(eventMask: [.warning, .critical], queue: .main)
        source.setEventHandler {
            let data = source.data
            if data.contains(.critical) {
                onPressure(.critical)
            } else if data.contains(.warning) {
                onPressure(.warning)
            }
        }
        source.resume()
        self.source = source
    }
}
