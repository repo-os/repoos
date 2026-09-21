import AppKit
import Foundation
import UserNotifications

@MainActor
protocol HubAttentionCoordinating: AnyObject {
    var snapshots: [UUID: ServerAttentionSnapshot] { get }
    func configure(entries: [ServerEntry], selectedServerID: UUID?, global: HubGlobalPreferences)
    func setSelectedServerID(_ id: UUID?)
    func refreshNow(serverID: UUID)
    func handleNotificationTap(serverID: UUID, path: String) -> HubNavigationRequest?
}

@MainActor
final class HubAttentionCoordinator: HubAttentionCoordinating, ObservableObject {
    @Published private(set) var snapshots: [UUID: ServerAttentionSnapshot] = [:]

    private let fetcher: HubSummaryFetching
    private let keychain: HubCapabilityStoring
    private let notificationCenter: HubUserNotificationCentering

    private var entries: [ServerEntry] = []
    private var selectedServerID: UUID?
    private var globalPreferences = HubGlobalPreferences.default
    private var refreshSlots: [UUID: HubSummaryRefreshSlot] = [:]
    private var dedupStates: [UUID: HubNotificationDedupState] = [:]
    private var dockBadgeTotal = 0
    private var schedulerTask: Task<Void, Never>?
    private var inFlight: Set<UUID> = []

    var onRequestNavigation: ((HubNavigationRequest) -> Void)?
    var onSnapshotsUpdated: (() -> Void)?

    init(
        fetcher: HubSummaryFetching = HubSummaryClient(),
        keychain: HubCapabilityStoring = HubCapabilityKeychainStore.shared,
        notificationCenter: HubUserNotificationCentering = SystemHubUserNotificationCenter()
    ) {
        self.fetcher = fetcher
        self.keychain = keychain
        self.notificationCenter = notificationCenter
    }

    func configure(entries: [ServerEntry], selectedServerID: UUID?, global: HubGlobalPreferences) {
        self.entries = entries
        self.selectedServerID = selectedServerID
        self.globalPreferences = global
        let valid = Set(entries.map(\.id))
        refreshSlots = refreshSlots.filter { valid.contains($0.key) }
        dedupStates = dedupStates.filter { valid.contains($0.key) }
        snapshots = snapshots.filter { valid.contains($0.key) }
        for entry in entries where snapshots[entry.id] == nil {
            let hasToken = hasCapability(for: entry)
            snapshots[entry.id] = ServerAttentionSnapshot.unavailable(serverID: entry.id, hasCapability: hasToken)
        }
        notifySnapshotsUpdated()
        restartScheduler()
        updateDockBadge()
        for entry in entries where entry.attentionAggregationEnabled {
            refreshNow(serverID: entry.id)
        }
    }

    func setSelectedServerID(_ id: UUID?) {
        selectedServerID = id
        if let id {
            refreshSlots[id] = HubSummaryRefreshSlot.initial(
                isSelected: true,
                now: Date()
            )
            refreshNow(serverID: id)
        }
        restartScheduler()
    }

    func refreshNow(serverID: UUID) {
        guard let entry = entries.first(where: { $0.id == serverID }) else { return }
        guard !inFlight.contains(serverID) else { return }
        inFlight.insert(serverID)
        Task {
            await performRefresh(entry: entry)
            inFlight.remove(serverID)
        }
    }

    func saveCapabilityToken(serverID: UUID, origin: String, token: String) throws {
        try keychain.saveToken(serverID: serverID, origin: origin, token: token)
        if let entry = entries.first(where: { $0.id == serverID }) {
            refreshNow(serverID: entry.id)
        }
    }

    func deleteCapabilityToken(serverID: UUID, origin: String) {
        keychain.deleteToken(serverID: serverID, origin: origin)
        snapshots[serverID] = ServerAttentionSnapshot.unavailable(serverID: serverID, hasCapability: false)
        updateDockBadge()
    }

    func handleNotificationTap(serverID: UUID, path: String) -> HubNavigationRequest? {
        let normalized = HubRecentsRetention.normalizeRoutePath(path)
        guard !normalized.isEmpty else { return nil }
        return HubNavigationRequest(serverID: serverID, path: normalized)
    }

    private func restartScheduler() {
        schedulerTask?.cancel()
        schedulerTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                let now = Date()
                for entry in self.entries where entry.attentionAggregationEnabled {
                    let isSelected = entry.id == self.selectedServerID
                    var slot = self.refreshSlots[entry.id]
                        ?? HubSummaryRefreshSlot.initial(isSelected: isSelected, now: now)
                    if now >= slot.nextFireAt {
                        self.refreshNow(serverID: entry.id)
                    }
                }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }

    private func performRefresh(entry: ServerEntry) async {
        let isSelected = entry.id == selectedServerID
        let now = Date()
        guard entry.attentionAggregationEnabled else {
            snapshots[entry.id] = ServerAttentionSnapshot.unavailable(serverID: entry.id, hasCapability: false)
            return
        }
        guard let origin = entry.originURL else {
            snapshots[entry.id] = ServerAttentionSnapshot.unavailable(serverID: entry.id, hasCapability: false)
            return
        }
        guard let token = keychain.loadToken(serverID: entry.id, origin: entry.originString) else {
            snapshots[entry.id] = ServerAttentionSnapshot.unavailable(serverID: entry.id, hasCapability: false)
            scheduleNext(entryID: entry.id, isSelected: isSelected, succeeded: false, now: now)
            return
        }

        let result = await fetcher.fetchSummary(origin: origin, token: token)
        switch result {
        case .success(let payload):
            let previousCounts = snapshots[entry.id]?.counts
            let snapshot = ServerAttentionSnapshot(
                serverID: entry.id,
                freshness: HubAttentionFreshness.classify(
                    fetchedAt: now,
                    lastError: nil,
                    hasCapability: true,
                    isSelected: isSelected,
                    now: now
                ),
                counts: payload.attention,
                fetchedAt: now,
                lastError: nil,
                hasCapability: true
            )
            snapshots[entry.id] = snapshot
            emitNotifications(entry: entry, previous: previousCounts, current: payload.attention)
            scheduleNext(entryID: entry.id, isSelected: isSelected, succeeded: true, now: now)
        case .failure(let failure):
            if failure == .unauthorized {
                keychain.deleteToken(serverID: entry.id, origin: entry.originString)
            }
            let freshness = HubAttentionFreshness.classify(
                fetchedAt: snapshots[entry.id]?.fetchedAt,
                lastError: failure,
                hasCapability: failure != .unauthorized && failure != .missingCapability,
                isSelected: isSelected,
                now: now
            )
            snapshots[entry.id] = ServerAttentionSnapshot(
                serverID: entry.id,
                freshness: freshness,
                counts: snapshots[entry.id]?.counts,
                fetchedAt: snapshots[entry.id]?.fetchedAt,
                lastError: failure,
                hasCapability: failure != .missingCapability && failure != .unauthorized
            )
            scheduleNext(entryID: entry.id, isSelected: isSelected, succeeded: false, now: now)
        }
        updateDockBadge()
        notifySnapshotsUpdated()
    }

    private func scheduleNext(entryID: UUID, isSelected: Bool, succeeded: Bool, now: Date) {
        var slot = refreshSlots[entryID] ?? HubSummaryRefreshSlot.initial(isSelected: isSelected, now: now)
        slot = slot.scheduledAfterAttempt(isSelected: isSelected, succeeded: succeeded, now: now)
        refreshSlots[entryID] = slot
    }

    private func emitNotifications(entry: ServerEntry, previous: HubAttentionCounts?, current: HubAttentionCounts) {
        guard globalPreferences.notificationsEnabled else { return }
        let settings = ServerAttentionNotifySettings(
            aggregationEnabled: entry.attentionAggregationEnabled,
            notifyReviewReady: entry.notifyReviewReady,
            notifyNeedsInput: entry.notifyNeedsInput,
            notifyActiveAgents: entry.notifyActiveAgents
        )
        let prior = dedupStates[entry.id] ?? .zero
        let outcome = HubNotificationEngine.notificationEvents(
            serverID: entry.id,
            serverName: entry.name,
            previous: previous,
            current: current,
            settings: settings,
            dedup: prior
        )
        dedupStates[entry.id] = outcome.dedup
        for event in outcome.events {
            notificationCenter.post(event: event)
        }
    }

    private func updateDockBadge() {
        let transition = HubNotificationEngine.dockBadgeTransition(
            previousTotal: dockBadgeTotal,
            snapshots: Array(snapshots.values),
            entries: entries,
            global: globalPreferences
        )
        switch transition {
        case .unchanged:
            break
        case .clear:
            dockBadgeTotal = 0
            NSApplication.shared.dockTile.badgeLabel = nil
        case .set(let total):
            dockBadgeTotal = total
            NSApplication.shared.dockTile.badgeLabel = total > 99 ? "99+" : "\(total)"
        }
    }

    private func hasCapability(for entry: ServerEntry) -> Bool {
        keychain.loadToken(serverID: entry.id, origin: entry.originString) != nil
    }

    private func notifySnapshotsUpdated() {
        onSnapshotsUpdated?()
    }
}

protocol HubUserNotificationCentering: Sendable {
    func post(event: HubAttentionNotificationEvent)
}

struct SystemHubUserNotificationCenter: HubUserNotificationCentering {
    func post(event: HubAttentionNotificationEvent) {
        let content = UNMutableNotificationContent()
        switch event.kind {
        case .reviewReady:
            content.title = "\(event.serverName): tasks ready for review"
            content.body = "\(event.count) task\(event.count == 1 ? "" : "s") in review"
        case .needsInput:
            content.title = "\(event.serverName): tasks need input"
            content.body = "\(event.count) task\(event.count == 1 ? "" : "s") waiting"
        case .activeAgents:
            content.title = "\(event.serverName): agents running"
            content.body = "\(event.count) active agent\(event.count == 1 ? "" : "s")"
        }
        content.userInfo = [
            "serverID": event.serverID.uuidString,
            "path": event.routePath,
        ]
        let request = UNNotificationRequest(
            identifier: "hub-\(event.serverID.uuidString)-\(event.kind.rawValue)-\(event.count)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }
}
