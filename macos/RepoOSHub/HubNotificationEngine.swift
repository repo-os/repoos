import Foundation

struct HubNotificationDedupState: Equatable, Sendable {
    var lastAnnouncedReview: Int
    var lastAnnouncedNeedsInput: Int
    var lastAnnouncedAgents: Int

    static let zero = HubNotificationDedupState(
        lastAnnouncedReview: 0,
        lastAnnouncedNeedsInput: 0,
        lastAnnouncedAgents: 0
    )
}

struct ServerAttentionNotifySettings: Equatable, Sendable {
    var aggregationEnabled: Bool
    var notifyReviewReady: Bool
    var notifyNeedsInput: Bool
    var notifyActiveAgents: Bool
}

enum HubBadgeTransition: Equatable, Sendable {
    case unchanged
    case set(Int)
    case clear
}

enum HubNotificationEngine {
    static func routePath(for kind: HubAttentionNotificationKind) -> String {
        switch kind {
        case .reviewReady, .needsInput:
            return "/work"
        case .activeAgents:
            return "/agents"
        }
    }

    static func notificationEvents(
        serverID: UUID,
        serverName: String,
        previous: HubAttentionCounts?,
        current: HubAttentionCounts,
        settings: ServerAttentionNotifySettings,
        dedup: HubNotificationDedupState
    ) -> (events: [HubAttentionNotificationEvent], dedup: HubNotificationDedupState) {
        guard settings.aggregationEnabled else { return ([], dedup) }
        var next = dedup
        var events: [HubAttentionNotificationEvent] = []

        if current.reviewReadyTasks < next.lastAnnouncedReview {
            next.lastAnnouncedReview = current.reviewReadyTasks
        }
        if settings.notifyReviewReady,
           current.reviewReadyTasks > next.lastAnnouncedReview
        {
            events.append(
                HubAttentionNotificationEvent(
                    serverID: serverID,
                    serverName: serverName,
                    kind: .reviewReady,
                    count: current.reviewReadyTasks,
                    routePath: routePath(for: .reviewReady)
                )
            )
            next.lastAnnouncedReview = current.reviewReadyTasks
        }

        if current.needsInputTasks < next.lastAnnouncedNeedsInput {
            next.lastAnnouncedNeedsInput = current.needsInputTasks
        }
        if settings.notifyNeedsInput,
           current.needsInputTasks > next.lastAnnouncedNeedsInput
        {
            events.append(
                HubAttentionNotificationEvent(
                    serverID: serverID,
                    serverName: serverName,
                    kind: .needsInput,
                    count: current.needsInputTasks,
                    routePath: routePath(for: .needsInput)
                )
            )
            next.lastAnnouncedNeedsInput = current.needsInputTasks
        }

        if current.activeAgents < next.lastAnnouncedAgents {
            next.lastAnnouncedAgents = current.activeAgents
        }
        if settings.notifyActiveAgents,
           current.activeAgents > next.lastAnnouncedAgents,
           (previous?.activeAgents ?? 0) == 0
        {
            events.append(
                HubAttentionNotificationEvent(
                    serverID: serverID,
                    serverName: serverName,
                    kind: .activeAgents,
                    count: current.activeAgents,
                    routePath: routePath(for: .activeAgents)
                )
            )
            next.lastAnnouncedAgents = current.activeAgents
        }

        return (events, next)
    }

    static func dockBadgeTransition(
        previousTotal: Int,
        snapshots: [ServerAttentionSnapshot],
        entries: [ServerEntry],
        global: HubGlobalPreferences
    ) -> HubBadgeTransition {
        guard global.dockBadgeEnabled else {
            return previousTotal == 0 ? .unchanged : .clear
        }
        let entryMap = Dictionary(uniqueKeysWithValues: entries.map { ($0.id, $0) })
        let total = snapshots.reduce(0) { partial, snapshot in
            guard let entry = entryMap[snapshot.serverID], entry.attentionAggregationEnabled else { return partial }
            guard snapshot.freshness != .unavailable, let counts = snapshot.counts else { return partial }
            return partial + counts.attentionTotal
        }
        if total == previousTotal { return .unchanged }
        if total == 0 { return .clear }
        return .set(total)
    }
}
