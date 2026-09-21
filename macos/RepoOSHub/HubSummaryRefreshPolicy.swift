import Foundation

/// Bounded polling schedule for inactive servers with exponential backoff on failures.
struct HubSummaryRefreshPolicy: Equatable, Sendable {
    var consecutiveFailures: Int

    init(consecutiveFailures: Int = 0) {
        self.consecutiveFailures = max(0, consecutiveFailures)
    }

    static let selectedBaseInterval: TimeInterval = 30
    static let backgroundBaseInterval: TimeInterval = 120
    static let maxInterval: TimeInterval = 900
    static let maxBackoffMultiplier: Double = 8

    func baseInterval(isSelected: Bool) -> TimeInterval {
        isSelected ? Self.selectedBaseInterval : Self.backgroundBaseInterval
    }

    func nextDelay(isSelected: Bool) -> TimeInterval {
        let base = baseInterval(isSelected: isSelected)
        guard consecutiveFailures > 0 else { return base }
        let multiplier = min(pow(2, Double(consecutiveFailures - 1)), Self.maxBackoffMultiplier)
        return min(base * multiplier, Self.maxInterval)
    }

    func afterSuccess() -> HubSummaryRefreshPolicy {
        HubSummaryRefreshPolicy(consecutiveFailures: 0)
    }

    func afterFailure() -> HubSummaryRefreshPolicy {
        HubSummaryRefreshPolicy(consecutiveFailures: consecutiveFailures + 1)
    }
}

struct HubSummaryRefreshSlot: Equatable, Sendable {
    var policy: HubSummaryRefreshPolicy
    var nextFireAt: Date

    static func initial(isSelected: Bool, now: Date) -> HubSummaryRefreshSlot {
        let policy = HubSummaryRefreshPolicy()
        return HubSummaryRefreshSlot(
            policy: policy,
            nextFireAt: now.addingTimeInterval(policy.nextDelay(isSelected: isSelected))
        )
    }

    func scheduledAfterAttempt(isSelected: Bool, succeeded: Bool, now: Date) -> HubSummaryRefreshSlot {
        let nextPolicy = succeeded ? policy.afterSuccess() : policy.afterFailure()
        let delay = nextPolicy.nextDelay(isSelected: isSelected)
        return HubSummaryRefreshSlot(policy: nextPolicy, nextFireAt: now.addingTimeInterval(delay))
    }
}
