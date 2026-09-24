import Foundation
import SwiftUI

@MainActor
final class HubAppState: ObservableObject {
    @Published private(set) var entries: [ServerEntry] = []
    @Published var selectedServerID: UUID?
    @Published var editorSheet: ServerEditorSheetModel?
    @Published var lastConnectionMessage: String?
    @Published private(set) var isPerformingHealthCheck = false
    @Published var isCommandPalettePresented = false
    @Published var pinTaskContextServerID: UUID?
    @Published private(set) var workspaceNavigation = WorkspaceNavigationSnapshot.placeholder
    @Published private(set) var pendingNavigationRequest: HubNavigationRequest?
    @Published private(set) var retainedWorkspaceServerIDs = Set<UUID>()
    @Published private(set) var runtimeInfoByServerID: [UUID: ServerRuntimeInfo] = [:]
    @Published var attentionSettingsServerID: UUID?
    @Published private(set) var hubGlobalPreferences: HubGlobalPreferences = .default
    @Published var serviceActionMessage: String?

    private let store: ServerRegistryStore
    private let healthChecker: HealthChecking
    let attentionCoordinator: HubAttentionCoordinator
    let crossServerTaskSearch: HubCrossServerTaskSearchEngine
    private var document = ServerRegistryDocument()
    private var workspaceResidencyLRU: [UUID] = []
    private var workspaceResidencyPressure: HubWorkspaceWebViewResidency.MemoryPressureLevel?

    init(
        store: ServerRegistryStore,
        healthChecker: HealthChecking,
        attentionCoordinator: HubAttentionCoordinator,
        crossServerTaskSearch: HubCrossServerTaskSearchEngine? = nil
    ) {
        self.store = store
        self.healthChecker = healthChecker
        self.attentionCoordinator = attentionCoordinator
        self.crossServerTaskSearch = crossServerTaskSearch ?? HubCrossServerTaskSearchEngine()
        self.attentionCoordinator.onSnapshotsUpdated = { [weak self] in
            self?.objectWillChange.send()
        }
        reloadFromDisk()
    }

    convenience init() {
        let directory = ServerRegistryStore.applicationSupportDirectory()
        let coordinator = HubAttentionCoordinator()
        self.init(
            store: ServerRegistryStore(directoryURL: directory),
            healthChecker: RepoOSHealthChecker(),
            attentionCoordinator: coordinator
        )
        Task { await refreshAllHealth() }
    }

    func attentionSnapshot(for serverID: UUID) -> ServerAttentionSnapshot? {
        attentionCoordinator.snapshots[serverID]
    }

    var selectedEntry: ServerEntry? {
        guard let selectedServerID else { return nil }
        return entries.first { $0.id == selectedServerID }
    }

    /// Workspaces in the LRU working set stay mounted so their WKWebViews keep page
    /// state; evicted servers reload on return (cookies persist on disk).
    var retainedWorkspaceEntries: [ServerEntry] {
        entries.filter { retainedWorkspaceServerIDs.contains($0.id) }
    }

    func runtimeInfo(for serverID: UUID) -> ServerRuntimeInfo? {
        runtimeInfoByServerID[serverID]
    }

    var pinnedEntries: [ServerEntry] {
        entries.filter(\.isPinned).sorted(by: entrySort)
    }

    var serverRecents: [ServerRecentMetadata] {
        document.serverRecents
    }

    var pinnedTaskContexts: [PinnedTaskContext] {
        document.pinnedTaskContexts
    }

    var pinnedTaskContextsForSidebar: [PinnedTaskContext] {
        document.pinnedTaskContexts.sorted { $0.pinnedAt > $1.pinnedAt }
    }

    var groupedEntries: [(title: String, entries: [ServerEntry])] {
        let unpinned = entries.filter { !$0.isPinned }
        let grouped = Dictionary(grouping: unpinned) { entry in
            let name = entry.groupName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return name.isEmpty ? "" : name
        }
        let keys = grouped.keys.sorted { lhs, rhs in
            if lhs.isEmpty { return false }
            if rhs.isEmpty { return true }
            return lhs.localizedCaseInsensitiveCompare(rhs) == .orderedAscending
        }
        return keys.map { key in
            let title = key.isEmpty ? "Servers" : key
            let items = (grouped[key] ?? []).sorted(by: entrySort)
            return (title, items)
        }
    }

    func reloadFromDisk() {
        do {
            document = try store.load()
            entries = document.entries.sorted(by: entrySort)
            if let last = document.lastSelectedServerID, entries.contains(where: { $0.id == last }) {
                selectedServerID = last
            } else {
                selectedServerID = entries.first?.id
            }
            if let selectedServerID {
                retainedWorkspaceServerIDs = [selectedServerID]
                workspaceResidencyLRU = [selectedServerID]
            } else {
                retainedWorkspaceServerIDs = []
                workspaceResidencyLRU = []
            }
            workspaceResidencyPressure = nil
            pruneOrphanNavigationMetadata()
            hubGlobalPreferences = document.hubGlobalPreferences
            restorePendingRouteForSelectedServer()
            syncAttentionCoordinator()
            crossServerTaskSearch.configure(entries: entries)
        } catch {
            document = ServerRegistryDocument()
            entries = []
            selectedServerID = nil
        }
    }

    func selectServer(_ id: UUID?) {
        guard selectedServerID != id else { return }
        let previousServerID = selectedServerID
        if let previousServerID {
            NotificationCenter.default.post(
                name: .hubWebReadAccentColor,
                object: nil,
                userInfo: HubWebNavigationCommand.userInfo(serverID: previousServerID)
            )
        }
        selectedServerID = id
        document.lastSelectedServerID = id
        workspaceNavigation = .placeholder
        if let id {
            noteWorkspaceUsed(id)
        }
        persistQuietly()
        restorePendingRouteForSelectedServer()
        attentionCoordinator.setSelectedServerID(id)
        syncAttentionCoordinator()
        if let id {
            Task { await refreshHealth(for: id) }
        }
    }

    func presentAttentionSettings(for entry: ServerEntry) {
        attentionSettingsServerID = entry.id
    }

    func dismissAttentionSettingsSheet() {
        attentionSettingsServerID = nil
    }

    func saveHubCapability(for entry: ServerEntry, token: String) throws {
        try attentionCoordinator.saveCapabilityToken(serverID: entry.id, origin: entry.originString, token: token)
        syncAttentionCoordinator()
    }

    func removeHubCapability(for entry: ServerEntry) {
        attentionCoordinator.deleteCapabilityToken(serverID: entry.id, origin: entry.originString)
        syncAttentionCoordinator()
    }

    func updateAttentionPreferences(
        for serverID: UUID,
        aggregationEnabled: Bool,
        notifyReviewReady: Bool,
        notifyNeedsInput: Bool,
        notifyActiveAgents: Bool,
        crossServerTaskSearchEnabled: Bool
    ) {
        guard let index = document.entries.firstIndex(where: { $0.id == serverID }) else { return }
        document.entries[index].attentionAggregationEnabled = aggregationEnabled
        document.entries[index].notifyReviewReady = notifyReviewReady
        document.entries[index].notifyNeedsInput = notifyNeedsInput
        document.entries[index].notifyActiveAgents = notifyActiveAgents
        document.entries[index].crossServerTaskSearchEnabled = crossServerTaskSearchEnabled
        document.entries[index].updatedAt = Date()
        entries = document.entries.sorted(by: entrySort)
        try? store.save(document)
        syncAttentionCoordinator()
        crossServerTaskSearch.configure(entries: entries)
    }

    func updateHubGlobalPreferences(notificationsEnabled: Bool?, dockBadgeEnabled: Bool?) {
        if let notificationsEnabled {
            document.hubGlobalPreferences.notificationsEnabled = notificationsEnabled
        }
        if let dockBadgeEnabled {
            document.hubGlobalPreferences.dockBadgeEnabled = dockBadgeEnabled
        }
        hubGlobalPreferences = document.hubGlobalPreferences
        try? store.save(document)
        syncAttentionCoordinator()
    }

    func handleHubNotificationOpen(serverID: UUID, path: String) {
        selectServer(serverID)
        requestNavigation(serverID: serverID, path: path)
    }

    func presentPinTaskContext(for entry: ServerEntry) {
        pinTaskContextServerID = entry.id
    }

    func dismissPinTaskContextSheet() {
        pinTaskContextServerID = nil
    }

    func presentCommandPalette() {
        isCommandPalettePresented = true
        crossServerTaskSearch.configure(entries: entries)
    }

    func dismissCommandPalette() {
        isCommandPalettePresented = false
        crossServerTaskSearch.cancel()
    }

    func performCommandPaletteAction(_ action: CommandPaletteAction) {
        switch action {
        case .selectServer(let id):
            selectServer(id)
        case .openRecent(let serverID, let path):
            selectServer(serverID)
            requestNavigation(serverID: serverID, path: path)
        case .openPinned(let pin):
            selectServer(pin.serverID)
            requestNavigation(serverID: pin.serverID, path: pin.routePath)
        case .openRemoteTask(let serverID, let path):
            selectServer(serverID)
            requestNavigation(serverID: serverID, path: path)
        case .addServer:
            presentAddServer()
        }
    }

    func requestNavigation(serverID: UUID, path: String) {
        let normalized = HubRecentsRetention.normalizeRoutePath(path)
        guard !normalized.isEmpty else { return }
        recordRouteVisit(serverID: serverID, path: normalized, title: nil)
        pendingNavigationRequest = HubNavigationRequest(serverID: serverID, path: normalized)
        NotificationCenter.default.post(
            name: .hubWebNavigationNavigate,
            object: nil,
            userInfo: HubWebNavigationCommand.userInfo(serverID: serverID, path: normalized)
        )
    }

    func recordRouteVisit(serverID: UUID, path: String, title: String?) {
        let normalized = HubRecentsRetention.normalizeRoutePath(path)
        guard !normalized.isEmpty else { return }
        var meta = document.serverRecents.first { $0.serverID == serverID }
            ?? ServerRecentMetadata(serverID: serverID)
        meta = HubRecentsRetention.recordVisit(
            path: normalized,
            title: title,
            visitedAt: Date(),
            metadata: meta
        )
        upsertRecentMetadata(meta)
        persistQuietly()
    }

    func pinTaskContext(
        serverID: UUID,
        taskIdentifier: String,
        routePath: String,
        label: String
    ) {
        let normalizedPath = HubRecentsRetention.normalizeRoutePath(routePath)
        let trimmedLabel = label.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTask = taskIdentifier.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedPath.isEmpty, !trimmedLabel.isEmpty, !trimmedTask.isEmpty else { return }

        document.pinnedTaskContexts.removeAll {
            $0.serverID == serverID && $0.taskIdentifier == trimmedTask
        }
        document.pinnedTaskContexts.append(
            PinnedTaskContext(
                serverID: serverID,
                taskIdentifier: trimmedTask,
                routePath: normalizedPath,
                label: trimmedLabel
            )
        )
        try? store.save(document)
    }

    /// Resolves a user-entered task number through the server, then stores a
    /// local shortcut with the canonical task route and the task's actual title.
    func pinTask(serverID: UUID, taskNumber: String) async -> String? {
        guard let identifier = Self.normalizedTaskIdentifier(taskNumber) else {
            return "Enter a task number, such as 1 or 0001."
        }
        guard let entry = entries.first(where: { $0.id == serverID }),
              let origin = entry.originURL
        else {
            return "This server is no longer available."
        }

        let token = HubCapabilityKeychainStore.shared.loadToken(serverID: entry.id, origin: entry.originString)
        guard token != nil || HubAccessPolicy.permitsLoopbackWithoutCapability(origin) else {
            return "Pair this remote server in Notifications before pinning its tasks."
        }

        let result = await HubTaskSearchClient().searchTasks(origin: origin, token: token, query: identifier)
        guard case .success(let payload) = result else {
            return "Could not look up task #\(identifier). Check that the server is online."
        }
        guard let task = payload.results.first(where: {
            Self.normalizedTaskIdentifier($0.id) == identifier
        }) else {
            return "Task #\(identifier) was not found on this server."
        }

        pinTaskContext(
            serverID: serverID,
            taskIdentifier: identifier,
            routePath: task.routePath,
            label: task.title
        )
        return nil
    }

    nonisolated static func normalizedTaskIdentifier(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "#", with: "")
        guard !trimmed.isEmpty, trimmed.allSatisfy(\.isNumber), let number = Int(trimmed), number > 0 else {
            return nil
        }
        return String(format: "%04d", number)
    }

    func unpinTaskContext(_ context: PinnedTaskContext) {
        document.pinnedTaskContexts.removeAll { $0.id == context.id }
        try? store.save(document)
    }

    func updateWorkspaceNavigation(_ snapshot: WorkspaceNavigationSnapshot) {
        guard workspaceNavigation != snapshot else { return }
        workspaceNavigation = snapshot
    }

    func workspaceGoBack() {
        guard workspaceNavigation.canGoBack, let selectedServerID else { return }
        NotificationCenter.default.post(
            name: .hubWebNavigationBack,
            object: nil,
            userInfo: HubWebNavigationCommand.userInfo(serverID: selectedServerID)
        )
    }

    func workspaceGoForward() {
        guard workspaceNavigation.canGoForward, let selectedServerID else { return }
        NotificationCenter.default.post(
            name: .hubWebNavigationForward,
            object: nil,
            userInfo: HubWebNavigationCommand.userInfo(serverID: selectedServerID)
        )
    }

    func workspaceReload() {
        if workspaceNavigation.hasEmbeddedWebContent, let selectedServerID {
            NotificationCenter.default.post(
                name: .hubWebNavigationReload,
                object: nil,
                userInfo: HubWebNavigationCommand.userInfo(serverID: selectedServerID)
            )
        } else if let id = selectedServerID {
            Task { await refreshHealth(for: id) }
        }
    }

    func consumePendingNavigationRequest(for serverID: UUID) -> HubNavigationRequest? {
        guard let request = pendingNavigationRequest, request.serverID == serverID else { return nil }
        pendingNavigationRequest = nil
        return request
    }

    func setPinned(_ entry: ServerEntry, pinned: Bool) {
        guard var found = document.entries.first(where: { $0.id == entry.id }) else { return }
        found.isPinned = pinned
        found.updatedAt = Date()
        do {
            try store.upsertEntry(found, in: &document)
            entries = document.entries.sorted(by: entrySort)
            try store.save(document)
        } catch {
            lastConnectionMessage = "Could not update the pin state locally."
        }
    }

    func presentAddServer() {
        editorSheet = ServerEditorSheetModel(mode: .add)
    }

    func presentEditServer(_ entry: ServerEntry) {
        editorSheet = ServerEditorSheetModel(mode: .edit(entry))
    }

    func clearWebsiteSession(for serverID: UUID) {
        ServerWebsiteDataStorePool.shared.clearWebsiteData(for: serverID) { [weak self] in
            Task { @MainActor in
                NotificationCenter.default.post(
                    name: .serverWebViewReload,
                    object: nil,
                    userInfo: HubWebNavigationCommand.userInfo(serverID: serverID)
                )
                self?.lastConnectionMessage = nil
            }
        }
    }

    func applyWorkspaceResidencyMemoryPressure(_ level: HubWorkspaceWebViewResidency.MemoryPressureLevel) {
        workspaceResidencyPressure = level
        enforceWorkspaceResidencyBudget()
    }

    func deleteServer(_ entry: ServerEntry) {
        ServerWebsiteDataStorePool.shared.removeStore(for: entry.id)
        retainedWorkspaceServerIDs.remove(entry.id)
        workspaceResidencyLRU.removeAll { $0 == entry.id }
        attentionCoordinator.deleteCapabilityToken(serverID: entry.id, origin: entry.originString)
        do {
            try store.removeEntry(id: entry.id, document: &document)
            entries = document.entries.sorted(by: entrySort)
            if selectedServerID == entry.id {
                selectedServerID = document.lastSelectedServerID
            }
            pruneOrphanNavigationMetadata()
            try store.save(document)
            lastConnectionMessage = nil
        } catch {
            lastConnectionMessage = "Could not remove the server from the local registry."
        }
    }

    func movePinned(from source: IndexSet, to destination: Int) {
        reorder(entries: pinnedEntries, subsetIDs: Set(pinnedEntries.map(\.id)), from: source, to: destination)
    }

    func moveGroup(named groupTitle: String, from source: IndexSet, to destination: Int) {
        let groupEntries: [ServerEntry]
        if groupTitle == "Servers" {
            groupEntries = entries.filter {
                !$0.isPinned && ( $0.groupName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true )
            }
        } else {
            groupEntries = entries.filter {
                !$0.isPinned && $0.groupName?.trimmingCharacters(in: .whitespacesAndNewlines) == groupTitle
            }
        }
        reorder(entries: groupEntries, subsetIDs: Set(groupEntries.map(\.id)), from: source, to: destination)
    }

    func saveFromEditor(_ draft: ServerEditorDraft) async -> String? {
        isPerformingHealthCheck = true
        defer { isPerformingHealthCheck = false }

        do {
            let origin = try ServerOriginNormalizer.normalizeOriginInput(draft.originText)
            let originKey = ServerOriginNormalizer.canonicalOriginKey(for: origin)

            let outcome = await healthChecker.checkHealth(origin: origin)
            guard case .success(let projectName, _, _) = outcome else {
                if case .failure(let failure) = outcome {
                    return failure.userMessage
                }
                return "Could not verify the server."
            }

            let now = Date()
            let group = draft.groupName.trimmingCharacters(in: .whitespacesAndNewlines)
            let normalizedGroup = group.isEmpty ? nil : group
            let colorHex = draft.accentColorHex.trimmingCharacters(in: .whitespacesAndNewlines)
            let icon = draft.iconSymbolName.trimmingCharacters(in: .whitespacesAndNewlines)

            switch draft.mode {
            case .add:
                let reportedName = projectName?.trimmingCharacters(in: .whitespacesAndNewlines)
                let name = reportedName.flatMap { $0.isEmpty ? nil : $0 }
                    ?? ServerOriginNormalizer.defaultDisplayName(for: origin)
                let entry = ServerEntry(
                    name: name,
                    repositoryName: reportedName.flatMap { $0.isEmpty ? nil : $0 },
                    origin: origin,
                    createdAt: now,
                    updatedAt: now,
                    lastHealth: .healthy,
                    lastHealthAt: now,
                    sortOrder: document.entries.count,
                    accentColorHex: colorHex.isEmpty ? nil : colorHex,
                    iconSymbolName: icon.isEmpty ? nil : icon,
                    groupName: normalizedGroup,
                    isPinned: draft.isPinned
                )
                try store.upsertEntry(entry, in: &document)
                entries = document.entries.sorted(by: entrySort)
                selectedServerID = entry.id
                document.lastSelectedServerID = entry.id
                noteWorkspaceUsed(entry.id)
            case .edit(let existing):
                let name = try ServerOriginNormalizer.validateDisplayName(draft.name)
                guard var entry = document.entries.first(where: { $0.id == existing.id }) else {
                    return "That server is no longer in the registry."
                }
                entry.name = name
                entry.originString = originKey
                entry.updatedAt = now
                entry.lastHealth = .healthy
                entry.lastHealthAt = now
                entry.accentColorHex = colorHex.isEmpty ? nil : colorHex
                entry.iconSymbolName = icon.isEmpty ? nil : icon
                entry.groupName = normalizedGroup
                entry.isPinned = draft.isPinned
                try store.upsertEntry(entry, in: &document)
                entries = document.entries.sorted(by: entrySort)
                selectedServerID = entry.id
                document.lastSelectedServerID = entry.id
                noteWorkspaceUsed(entry.id)
            }

            try store.save(document)
            syncAttentionCoordinator()
            crossServerTaskSearch.configure(entries: entries)
            lastConnectionMessage = nil
            return nil
        } catch ServerRegistryStoreError.duplicateOrigin {
            return "A server with this origin is already saved."
        } catch let error as ServerOriginError {
            return originErrorMessage(error)
        } catch {
            return "Could not save the server locally."
        }
    }

    func refreshHealth(for id: UUID, using checker: (any HealthChecking)? = nil) async {
        guard let index = document.entries.firstIndex(where: { $0.id == id }),
              let origin = document.entries[index].originURL
        else { return }

        let outcome = await (checker ?? healthChecker).checkHealth(origin: origin)
        var entry = document.entries[index]
        ReachabilityTransition.applyHealthCheck(to: &entry, outcome: outcome)
        if case .success(let projectName, let runtimeInfo, let projectPath) = outcome {
            updateRepositoryIdentity(for: &entry, projectName: projectName)
            if HubAccessPolicy.permitsLoopbackWithoutCapability(origin), let projectPath,
               projectPath.hasPrefix("/")
            {
                entry.localProjectPath = projectPath
            }
            if let runtimeInfo {
                runtimeInfoByServerID[id] = runtimeInfo
            } else {
                runtimeInfoByServerID.removeValue(forKey: id)
            }
        }
        document.entries[index] = entry
        entries = document.entries.sorted(by: entrySort)

        if selectedServerID == id, case .failure(let failure) = outcome {
            lastConnectionMessage = failure.userMessage
        } else if selectedServerID == id {
            lastConnectionMessage = nil
        }

        try? store.save(document)
    }

    func performLocalServiceAction(_ action: LocalRepoOSServiceAction, for entry: ServerEntry) async {
        guard entry.originURL.map(HubAccessPolicy.permitsLoopbackWithoutCapability) == true,
              let root = entry.localProjectPath
        else {
            serviceActionMessage = "RepoOS needs to see this local server online once before it can manage its background service."
            return
        }
        do {
            try await LocalRepoOSServiceController.perform(action, projectRoot: root)
            serviceActionMessage = action.successMessage
            if action != .stop {
                try? await Task.sleep(nanoseconds: 750_000_000)
                await refreshHealth(for: entry.id)
            }
        } catch {
            serviceActionMessage = error.localizedDescription
        }
    }

    /// Starts a previously verified local RepoOS service and waits for its health
    /// endpoint before the workspace reloads. Remote servers are intentionally
    /// excluded: the Hub must never attempt to execute commands on another host.
    func startLocalServerAndWait(for entry: ServerEntry) async -> Bool {
        guard entry.originURL.map(HubAccessPolicy.permitsLoopbackWithoutCapability) == true,
              let root = entry.localProjectPath
        else {
            serviceActionMessage = "RepoOS needs to see this local server online once before it can manage its background service."
            return false
        }

        do {
            try await LocalRepoOSServiceController.perform(.start, projectRoot: root)
            let startupChecker = RepoOSHealthChecker(timeout: 1)
            let deadline = Date().addingTimeInterval(30)
            repeat {
                try await Task.sleep(nanoseconds: 500_000_000)
                await refreshHealth(for: entry.id, using: startupChecker)
                if document.entries.first(where: { $0.id == entry.id })?.lastHealth == .healthy {
                    return true
                }
            } while Date() < deadline
            serviceActionMessage = "RepoOS did not become ready within 30 seconds. Check the service logs, then try again."
        } catch {
            serviceActionMessage = error.localizedDescription
        }
        return false
    }

    private func refreshAllHealth() async {
        for entry in entries {
            await refreshHealth(for: entry.id)
        }
    }

    private func updateRepositoryIdentity(for entry: inout ServerEntry, projectName: String?) {
        let reportedName = projectName?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let reportedName, !reportedName.isEmpty else { return }

        let fallbackName = entry.originURL.map(ServerOriginNormalizer.defaultDisplayName) ?? "RepoOS server"
        if entry.name == fallbackName {
            entry.name = reportedName
        }
        entry.repositoryName = reportedName
    }

    func updateWorkspaceAccentColor(_ color: String?, for serverID: UUID) {
        guard let index = document.entries.firstIndex(where: { $0.id == serverID }) else { return }
        let normalized = ServerAccentColor.normalizedHex(color)
        guard document.entries[index].accentColorHex != normalized else { return }
        document.entries[index].accentColorHex = normalized
        document.entries[index].updatedAt = Date()
        entries = document.entries.sorted(by: entrySort)
        try? store.save(document)
    }

    private func noteWorkspaceUsed(_ serverID: UUID) {
        workspaceResidencyLRU = HubWorkspaceWebViewResidency.touch(serverID: serverID, in: workspaceResidencyLRU)
        retainedWorkspaceServerIDs.insert(serverID)
        enforceWorkspaceResidencyBudget()
    }

    private func enforceWorkspaceResidencyBudget() {
        let maxInactive = HubWorkspaceWebViewResidency.maxInactive(for: workspaceResidencyPressure)
        let (newRetained, evicted) = HubWorkspaceWebViewResidency.applyingBudget(
            retained: retainedWorkspaceServerIDs,
            lruOrder: workspaceResidencyLRU,
            activeServerID: selectedServerID,
            maxInactive: maxInactive
        )
        guard !evicted.isEmpty else { return }
        for serverID in evicted {
            ServerWebsiteDataStorePool.shared.releaseCachedStore(for: serverID)
        }
        retainedWorkspaceServerIDs = newRetained
        workspaceResidencyLRU.removeAll { evicted.contains($0) }
    }

    private func persistQuietly() {
        try? store.save(document)
    }

    private func syncAttentionCoordinator() {
        attentionCoordinator.configure(
            entries: entries,
            selectedServerID: selectedServerID,
            global: hubGlobalPreferences
        )
    }

    private func upsertRecentMetadata(_ metadata: ServerRecentMetadata) {
        if let index = document.serverRecents.firstIndex(where: { $0.serverID == metadata.serverID }) {
            document.serverRecents[index] = metadata
        } else {
            document.serverRecents.append(metadata)
        }
    }

    private func pruneOrphanNavigationMetadata() {
        let valid = Set(document.entries.map(\.id))
        document.serverRecents = HubRecentsRetention.prune(metadata: document.serverRecents, validServerIDs: valid)
        document.pinnedTaskContexts = HubRecentsRetention.prune(pinned: document.pinnedTaskContexts, validServerIDs: valid)
    }

    private func restorePendingRouteForSelectedServer() {
        guard let serverID = selectedServerID,
              let meta = document.serverRecents.first(where: { $0.serverID == serverID }),
              let path = meta.lastRoutePath
        else { return }
        pendingNavigationRequest = HubNavigationRequest(serverID: serverID, path: path)
    }

    private func reorder(entries subset: [ServerEntry], subsetIDs: Set<UUID>, from source: IndexSet, to destination: Int) {
        var ordered = document.entries.sorted(by: entrySort)
        var visible = subset
        visible.move(fromOffsets: source, toOffset: destination)
        var iterator = visible.makeIterator()
        for index in ordered.indices where subsetIDs.contains(ordered[index].id) {
            if let next = iterator.next() {
                ordered[index] = next
            }
        }
        for index in ordered.indices {
            ordered[index].sortOrder = index
        }
        document.entries = ordered
        self.entries = ordered
        try? store.save(document)
    }

    private var entrySort: (ServerEntry, ServerEntry) -> Bool {
        { lhs, rhs in
            if lhs.sortOrder != rhs.sortOrder { return lhs.sortOrder < rhs.sortOrder }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }

    private func originErrorMessage(_ error: ServerOriginError) -> String {
        switch error {
        case .empty: return "Enter a server address."
        case .invalidURL: return "That does not look like a valid URL."
        case .notHTTPS: return "That address is not supported. Use a server URL or hostname."
        case .credentialsNotAllowed: return "Remove credentials from the URL and sign in through the web UI instead."
        case .fragmentNotAllowed, .queryNotAllowed, .pathNotAllowed:
            return "Use the server root origin only, without paths or query parameters."
        case .missingHost: return "The URL must include a host name."
        case .nameEmpty: return "Enter a display name for this server."
        case .nameTooLong: return "Display names can be at most 80 characters."
        }
    }
}

struct ServerEditorDraft {
    enum Mode {
        case add
        case edit(ServerEntry)
    }

    var mode: Mode
    var name: String
    var originText: String
    var groupName: String
    var accentColorHex: String
    var iconSymbolName: String
    var isPinned: Bool
}

struct ServerEditorSheetModel: Identifiable {
    enum Mode {
        case add
        case edit(ServerEntry)
    }

    let id = UUID()
    let mode: Mode

    init(mode: Mode) {
        self.mode = mode
    }
}

extension ServerEditorDraft {
    init(mode: ServerEditorSheetModel.Mode) {
        switch mode {
        case .add:
            self.mode = .add
            name = ""
            originText = ""
            groupName = ""
            accentColorHex = ""
            iconSymbolName = "server.rack"
            isPinned = false
        case .edit(let entry):
            self.mode = .edit(entry)
            name = entry.name
            originText = entry.originString
            groupName = entry.groupName ?? ""
            accentColorHex = entry.accentColorHex ?? ""
            iconSymbolName = entry.iconSymbolName ?? "server.rack"
            isPinned = entry.isPinned
        }
    }
}
