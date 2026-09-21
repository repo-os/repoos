import SwiftUI

struct PinTaskContextSheet: View {
    @EnvironmentObject private var appState: HubAppState
    @Environment(\.dismiss) private var dismiss

    let serverID: UUID
    @State private var taskIdentifier = ""
    @State private var routePath = "/tasks/"
    @State private var label = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Pin task context")
                .font(.title3.weight(.semibold))

            Text("Pinned contexts are local route hints only. Visiting a task in the web UI does not pin it automatically.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            TextField("Task ID", text: $taskIdentifier)
                .accessibilityLabel("Task identifier")

            TextField("Route path", text: $routePath)
                .accessibilityLabel("Route path")

            TextField("Label", text: $label)
                .accessibilityLabel("Pin label")

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Pin") { save() }
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(24)
        .frame(width: 420)
    }

    private func save() {
        appState.pinTaskContext(
            serverID: serverID,
            taskIdentifier: taskIdentifier,
            routePath: routePath,
            label: label.isEmpty ? "Task \(taskIdentifier)" : label
        )
        dismiss()
    }
}
