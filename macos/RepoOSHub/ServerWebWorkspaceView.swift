import SwiftUI

struct ServerWebWorkspaceView: View {
    @EnvironmentObject private var appState: HubAppState
    let entry: ServerEntry

    @StateObject private var webModel: ServerWebViewModel

    init(entry: ServerEntry) {
        self.entry = entry
        _webModel = StateObject(
            wrappedValue: ServerWebViewModel(
                serverID: entry.id,
                origin: entry.originURL ?? URL(string: "https://invalid.invalid")!
            )
        )
    }

    var body: some View {
        ZStack {
            if entry.originURL != nil {
                ServerWebView(model: webModel, appState: appState)
                    .id(entry.id)
            } else {
                invalidOriginState
            }

            if let healthMessage = appState.lastConnectionMessage {
                VStack {
                    ConnectionFailureBanner(message: healthMessage) {
                        Task { await appState.refreshHealth(for: entry.id) }
                    }
                    Spacer()
                }
            }

            if let failure = webModel.loadFailure {
                WebLoadFailureOverlay(
                    origin: entry.originString,
                    failure: failure,
                    onRetry: webModel.reload,
                    onEdit: { appState.presentEditServer(entry) },
                    onRemove: { appState.deleteServer(entry) },
                    onClearSession: { appState.clearWebsiteSession(for: entry.id) }
                )
            }

            if webModel.isLoading {
                ProgressView()
                    .controlSize(.regular)
                    .padding(12)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .sheet(isPresented: $webModel.showOAuthGuidance) {
            ExternalNavigationSheet(
                url: webModel.pendingExternalURL,
                onOpen: webModel.openPendingExternalURL,
                onDismiss: webModel.dismissExternalPrompt
            )
        }
        .navigationTitle(entry.name)
        .onDisappear {
            appState.updateWorkspaceNavigation(.placeholder)
        }
    }

    private var invalidOriginState: some View {
        WebLoadFailureOverlay(
            origin: entry.originString,
            failure: .unknown("This saved server has an invalid HTTPS origin."),
            onRetry: { appState.presentEditServer(entry) },
            onEdit: { appState.presentEditServer(entry) },
            onRemove: { appState.deleteServer(entry) },
            onClearSession: {}
        )
    }
}

struct ConnectionFailureBanner: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 4) {
                Text("Health check failed")
                    .font(.subheadline.weight(.semibold))
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Retry", action: onRetry)
                .controlSize(.small)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .accessibilityElement(children: .contain)
    }
}

struct WebLoadFailureOverlay: View {
    let origin: String
    let failure: ServerWebLoadFailure
    let onRetry: () -> Void
    let onEdit: () -> Void
    let onRemove: () -> Void
    let onClearSession: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(.orange)
                .accessibilityHidden(true)

            Text(failure.title)
                .font(.title3.weight(.semibold))

            Text(origin)
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
                .textSelection(.enabled)

            Text(failure.guidance)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 420)

            HStack(spacing: 12) {
                Button("Retry", action: onRetry)
                Button("Edit server…", action: onEdit)
                Button("Clear sign-in", action: onClearSession)
                Button("Remove server", role: .destructive, action: onRemove)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor).opacity(0.94))
        .accessibilityElement(children: .contain)
    }
}

struct ExternalNavigationSheet: View {
    let url: URL?
    let onOpen: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Open in your browser?")
                .font(.title3.weight(.semibold))

            Text(
                "RepoOS Hub keeps each server inside an isolated web view. Sign-in providers, documentation, and other external sites open in your default browser instead."
            )
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)

            if let url {
                Text(url.absoluteString)
                    .font(.caption.monospaced())
                    .textSelection(.enabled)
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color(nsColor: .controlBackgroundColor)))
            }

            Text(
                "Some enterprise SSO providers block embedded browsers. If sign-in fails in the browser, contact your administrator — the Hub cannot copy cookies between Safari and this web view."
            )
            .font(.caption)
            .foregroundStyle(.secondary)

            HStack {
                Spacer()
                Button("Cancel", action: onDismiss)
                Button("Open in browser", action: onOpen)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(24)
        .frame(width: 460)
    }
}
