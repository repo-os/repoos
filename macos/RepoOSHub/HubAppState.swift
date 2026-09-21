import Foundation
import SwiftUI

@MainActor
final class HubAppState: ObservableObject {
    @Published private(set) var entries: [ServerEntry] = []
    @Published var selectedServerID: UUID?
    @Published var editorSheet: ServerEditorSheetModel?
    @Published var lastConnectionMessage: String?
    @Published private(set) var isPerformingHealthCheck = false

    private let store: ServerRegistryStore
    private let healthChecker: HealthChecking
    private var document = ServerRegistryDocument()

    init(store: ServerRegistryStore, healthChecker: HealthChecking) {
        self.store = store
        self.healthChecker = healthChecker
        reloadFromDisk()
    }

    convenience init() {
        let directory = ServerRegistryStore.applicationSupportDirectory()
        self.init(store: ServerRegistryStore(directoryURL: directory), healthChecker: RepoOSHealthChecker())
        if let selectedServerID {
            Task { await refreshHealth(for: selectedServerID) }
        }
    }

    var selectedEntry: ServerEntry? {
        guard let selectedServerID else { return nil }
        return entries.first { $0.id == selectedServerID }
    }

    var pinnedEntries: [ServerEntry] {
        entries.filter(\.isPinned).sorted(by: entrySort)
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
        } catch {
            document = ServerRegistryDocument()
            entries = []
            selectedServerID = nil
        }
    }

    func selectServer(_ id: UUID?) {
        guard selectedServerID != id else { return }
        selectedServerID = id
        document.lastSelectedServerID = id
        persistQuietly()
        if let id {
            Task { await refreshHealth(for: id) }
        }
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

    func deleteServer(_ entry: ServerEntry) {
        do {
            try store.removeEntry(id: entry.id, document: &document)
            entries = document.entries.sorted(by: entrySort)
            if selectedServerID == entry.id {
                selectedServerID = document.lastSelectedServerID
            }
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
            let name = try ServerOriginNormalizer.validateDisplayName(draft.name)
            let origin = try ServerOriginNormalizer.normalizeOriginInput(draft.originText)
            let originKey = ServerOriginNormalizer.canonicalOriginKey(for: origin)

            let outcome = await healthChecker.checkHealth(origin: origin)
            guard case .success = outcome else {
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
                var entry = ServerEntry(
                    name: name,
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
            case .edit(let existing):
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
            }

            try store.save(document)
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

    func refreshHealth(for id: UUID) async {
        guard let index = document.entries.firstIndex(where: { $0.id == id }),
              let origin = document.entries[index].originURL
        else { return }

        let outcome = await healthChecker.checkHealth(origin: origin)
        var entry = document.entries[index]
        ReachabilityTransition.applyHealthCheck(to: &entry, outcome: outcome)
        document.entries[index] = entry
        entries = document.entries.sorted(by: entrySort)

        if selectedServerID == id, case .failure(let failure) = outcome {
            lastConnectionMessage = failure.userMessage
        } else if selectedServerID == id {
            lastConnectionMessage = nil
        }

        try? store.save(document)
    }

    private func persistQuietly() {
        try? store.save(document)
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
        case .empty: return "Enter the HTTPS address for the RepoOS server."
        case .invalidURL: return "That does not look like a valid URL."
        case .notHTTPS: return "Only HTTPS origins are allowed."
        case .credentialsNotAllowed: return "Remove credentials from the URL and sign in through the web UI instead."
        case .fragmentNotAllowed, .queryNotAllowed, .pathNotAllowed:
            return "Use the server root HTTPS origin only, without paths or query parameters."
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
            originText = "https://"
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
