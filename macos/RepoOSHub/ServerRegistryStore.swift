import Foundation

enum ServerRegistryStoreError: Error, Equatable {
    case duplicateOrigin
    case entryNotFound
    case invalidDocument
}

final class ServerRegistryStore: @unchecked Sendable {
    private let fileURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let lock = NSLock()

    init(directoryURL: URL, fileName: String = "servers.json") {
        self.fileURL = directoryURL.appendingPathComponent(fileName, isDirectory: false)
        self.encoder = JSONEncoder()
        self.decoder = JSONDecoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    func load() throws -> ServerRegistryDocument {
        lock.lock()
        defer { lock.unlock() }
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return ServerRegistryDocument()
        }
        let data = try Data(contentsOf: fileURL)
        let document = try decoder.decode(ServerRegistryDocument.self, from: data)
        guard document.version == ServerRegistryDocument.currentVersion else {
            throw ServerRegistryStoreError.invalidDocument
        }
        return document
    }

    func save(_ document: ServerRegistryDocument) throws {
        lock.lock()
        defer { lock.unlock() }
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        var doc = document
        doc.version = ServerRegistryDocument.currentVersion
        let data = try encoder.encode(doc)
        let tempURL = fileURL.appendingPathExtension("tmp")
        try data.write(to: tempURL, options: .atomic)
        if FileManager.default.fileExists(atPath: fileURL.path) {
            _ = try FileManager.default.replaceItemAt(fileURL, withItemAt: tempURL)
        } else {
            try FileManager.default.moveItem(at: tempURL, to: fileURL)
        }
    }

    func upsertEntry(_ entry: ServerEntry, in document: inout ServerRegistryDocument) throws {
        let key = entry.originString
        if let duplicate = document.entries.first(where: {
            $0.originString == key && $0.id != entry.id
        }) {
            _ = duplicate
            throw ServerRegistryStoreError.duplicateOrigin
        }
        if let index = document.entries.firstIndex(where: { $0.id == entry.id }) {
            document.entries[index] = entry
        } else {
            document.entries.append(entry)
            normalizeSortOrders(&document.entries)
        }
    }

    func removeEntry(id: UUID, document: inout ServerRegistryDocument) throws {
        guard let index = document.entries.firstIndex(where: { $0.id == id }) else {
            throw ServerRegistryStoreError.entryNotFound
        }
        document.entries.remove(at: index)
        if document.lastSelectedServerID == id {
            document.lastSelectedServerID = document.entries.sorted(by: sortComparator).first?.id
        }
        normalizeSortOrders(&document.entries)
    }

    func moveEntries(from source: IndexSet, to destination: Int, document: inout ServerRegistryDocument) {
        var ordered = document.entries.sorted(by: sortComparator)
        ordered.move(fromOffsets: source, toOffset: destination)
        for (index, _) in ordered.enumerated() {
            ordered[index].sortOrder = index
        }
        document.entries = ordered
    }

    private func normalizeSortOrders(_ entries: inout [ServerEntry]) {
        var sorted = entries.sorted(by: sortComparator)
        for index in sorted.indices {
            sorted[index].sortOrder = index
        }
        entries = sorted
    }

    private var sortComparator: (ServerEntry, ServerEntry) -> Bool {
        { lhs, rhs in
            if lhs.sortOrder != rhs.sortOrder { return lhs.sortOrder < rhs.sortOrder }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }
}

extension ServerRegistryStore {
    static func applicationSupportDirectory(appName: String = "RepoOS Hub") -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return base.appendingPathComponent(appName, isDirectory: true)
    }
}
